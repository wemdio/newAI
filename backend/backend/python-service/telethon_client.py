"""Telethon Client Manager - Handles Telegram connections and messaging"""
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    FloodWaitError,
    PeerFloodError,
    ChatWriteForbiddenError,
    UserBannedInChannelError,
    AuthKeyUnregisteredError,
    SessionPasswordNeededError
)
from telethon.errors.rpcbaseerrors import ForbiddenError
from urllib.parse import urlparse
from typing import Dict, Optional, Callable
import asyncio
import os
import socks
import socket


class TelethonManager:
    """Manages Telethon clients for multiple Telegram accounts"""
    
    def __init__(self, supabase, safety_manager):
        self.supabase = supabase
        self.safety = safety_manager
        self.clients: Dict[str, TelegramClient] = {}  # {account_id: client}
        self.event_handlers = {}  # {account_id: callback}
    
    async def init_account(self, account: Dict) -> bool:
        """
        Initialize Telethon client for an account
        
        Args:
            account: Account dict from database
        
        Returns:
            True if successful, False otherwise
        """
        account_id = str(account['id'])
        session_file = f"sessions/{account['session_file']}"
        
        try:
            # Create sessions directory if it doesn't exist
            os.makedirs('sessions', exist_ok=True)
            
            # Check if we have session_string
            session_string_data = account.get('session_string')
            if session_string_data:
                print(f"🔧 Processing session_string for {account['account_name']}")
                
                # Check format: hex:dc_id or pure Telethon StringSession
                session_str = session_string_data.strip()
                
                # If it contains ':' it's likely hex:dc format from account shop
                # We need to create a session file from it
                if ':' in session_str and not os.path.exists(f"{session_file}.session"):
                    try:
                        print(f"   Detected hex:dc format, creating session file")
                        # Split hex and dc_id
                        hex_part, dc_str = session_str.rsplit(':', 1)
                        dc_id = int(dc_str)
                        
                        # Decode hex auth_key
                        auth_key_bytes = bytes.fromhex(hex_part)
                        
                        print(f"   Auth key: {len(auth_key_bytes)} bytes, DC: {dc_id}")
                        
                        # Create StringSession from auth_key
                        # We'll use empty StringSession and manually set auth_key
                        # Actually, let's just use the file-based approach
                        # Create a minimal SQLite session file with this auth_key
                        import sqlite3
                        
                        session_path = f"{session_file}.session"
                        conn = sqlite3.connect(session_path)
                        conn.execute('''CREATE TABLE sessions (
                            dc_id INTEGER PRIMARY KEY,
                            server_address TEXT,
                            port INTEGER,
                            auth_key BLOB
                        )''')
                        conn.execute('''CREATE TABLE version (version INTEGER PRIMARY KEY)''')
                        conn.execute('INSERT INTO version VALUES (8)')
                        
                        # Insert auth_key with DC info
                        # We need to map DC ID to server address
                        dc_map = {
                            1: ('149.154.175.53', 443),
                            2: ('149.154.167.51', 443),
                            3: ('149.154.175.100', 443),
                            4: ('149.154.167.91', 443),
                            5: ('91.108.56.130', 443)
                        }
                        
                        server_addr, port = dc_map.get(dc_id, ('149.154.175.53', 443))
                        
                        conn.execute(
                            'INSERT INTO sessions VALUES (?, ?, ?, ?)',
                            (dc_id, server_addr, port, auth_key_bytes)
                        )
                        conn.commit()
                        conn.close()
                        
                        print(f"   ✅ Created session file from hex:dc format")
                        
                    except Exception as e:
                        print(f"   ❌ Failed to convert hex:dc to session: {e}")
                        import traceback
                        traceback.print_exc()
                        return False
                elif not ':' in session_str:
                    # Pure Telethon StringSession format
                    print(f"   Detected Telethon StringSession format")
                    try:
                        session_file = StringSession(session_str)
                    except Exception as e:
                        print(f"   ❌ Invalid StringSession format: {e}")
                        return False
            
            # Parse proxy if provided
            proxy = self._parse_proxy(account.get('proxy_url'))
            
            # Check proxy connection if proxy is configured
            if proxy:
                proxy_works = await self._check_proxy(proxy)
                if not proxy_works:
                    print(f"❌ Proxy verification failed for account {account['account_name']}")
                    print(f"   Cannot connect to Telegram through proxy: {account.get('proxy_url')}")
                    # Mark account as error in database
                    await self.supabase.mark_account_error(
                        account_id,
                        f"Proxy connection failed: {account.get('proxy_url')}"
                    )
                    return False
            
            # Create client
            client = TelegramClient(
                session_file,
                account['api_id'],
                account['api_hash'],
                proxy=proxy
            )
            
            # Connect
            await client.connect()
            
            # Check authorization
            if not await client.is_user_authorized():
                print(f"❌ Account {account['account_name']} not authorized")
                return False
            
            # Get account info
            me = await client.get_me()
            print(f"✅ Initialized account: {account['account_name']} (@{me.username or me.id})")
            
            # Store client
            self.clients[account_id] = client
            
            # Setup message listener
            await self._setup_message_listener(account_id, client)
            
            return True
            
        except AuthKeyUnregisteredError:
            print(f"❌ Account {account_id} auth key unregistered (banned or deleted)")
            await self.safety.handle_account_ban(account_id)
            return False
        except Exception as e:
            print(f"❌ Error initializing account {account_id}: {e}")
            return False
    
    def _parse_proxy(self, proxy_url: Optional[str]) -> Optional[Dict]:
        """
        Parse proxy URL to Telethon proxy dict
        
        Format: 
        1. protocol://username:password@host:port (Standard URL)
        2. ip:port:username:password (Common proxy format)
        """
        if not proxy_url:
            return None
        
        try:
            # Check for ip:port:user:pass format first (if no protocol scheme)
            if '://' not in proxy_url and proxy_url.count(':') == 3:
                parts = proxy_url.split(':')
                if len(parts) == 4:
                    # Assume SOCKS5 as default for this format as it's most common for Telegram
                    return {
                        'proxy_type': 'socks5',
                        'addr': parts[0],
                        'port': int(parts[1]),
                        'username': parts[2],
                        'password': parts[3]
                    }

            parsed = urlparse(proxy_url)
            
            # Map protocol
            protocol_map = {
                'socks5': 'socks5',
                'socks4': 'socks4',
                'http': 'http',
                'https': 'http'
            }
            
            proxy_type = protocol_map.get(parsed.scheme)
            
            # Fallback for common formats without scheme
            if not proxy_type:
                # If parsing failed to find scheme, maybe it is user:pass@ip:port
                if '@' in proxy_url and not parsed.scheme:
                     return self._parse_proxy(f"socks5://{proxy_url}")

                print(f"⚠️ Unsupported proxy protocol: {parsed.scheme}")
                return None
            
            proxy_dict = {
                'proxy_type': proxy_type,
                'addr': parsed.hostname,
                'port': parsed.port,
            }
            
            if parsed.username:
                proxy_dict['username'] = parsed.username
            if parsed.password:
                proxy_dict['password'] = parsed.password
            
            return proxy_dict
            
        except Exception as e:
            print(f"⚠️ Error parsing proxy URL: {e}")
            return None
    
    async def _check_proxy(self, proxy_dict: Dict) -> bool:
        """
        Check if proxy is working by attempting to connect to Telegram servers
        
        Args:
            proxy_dict: Parsed proxy dictionary
        
        Returns:
            True if proxy works, False otherwise
        """
        if not proxy_dict:
            return True  # No proxy means direct connection
        
        print(f"🔍 Testing proxy connection: {proxy_dict['addr']}:{proxy_dict['port']}")
        
        try:
            # Map proxy type to PySocks constants
            proxy_type_map = {
                'socks5': socks.SOCKS5,
                'socks4': socks.SOCKS4,
                'http': socks.HTTP
            }
            
            proxy_type = proxy_type_map.get(proxy_dict['proxy_type'])
            if not proxy_type:
                print(f"❌ Unsupported proxy type for testing: {proxy_dict['proxy_type']}")
                return False
            
            # Test connection to Telegram server (DC1)
            telegram_host = '149.154.175.53'
            telegram_port = 443
            timeout = 10
            
            # Create socket with proxy
            sock = socks.socksocket()
            sock.set_proxy(
                proxy_type=proxy_type,
                addr=proxy_dict['addr'],
                port=proxy_dict['port'],
                username=proxy_dict.get('username'),
                password=proxy_dict.get('password')
            )
            sock.settimeout(timeout)
            
            # Try to connect
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: sock.connect((telegram_host, telegram_port))
            )
            sock.close()
            
            print(f"✅ Proxy connection successful")
            return True
            
        except socks.ProxyConnectionError as e:
            print(f"❌ Proxy connection failed: {e}")
            return False
        except socket.timeout:
            print(f"❌ Proxy connection timeout")
            return False
        except Exception as e:
            print(f"❌ Proxy test failed: {e}")
            return False
    
    async def send_message(self, account_id: str, username: str, message: str) -> str:
        """
        Send message to user
        
        Args:
            account_id: Account to use
            username: Target username (without @)
            message: Message text
        
        Returns:
            "success" - message sent
            "privacy_premium" - user requires Telegram Premium to receive messages
            "flood_wait" - rate limited
            "peer_flood" - spam ban
            "forbidden" - can't write to user
            "banned" - account banned
            "error" - other error
        """
        client = self.clients.get(account_id)
        if not client:
            print(f"❌ Client {account_id} not initialized")
            return "error"
        
        try:
            # Send message
            await client.send_message(username, message)
            print(f"✉️ Sent message to @{username}")
            return "success"
            
        except FloodWaitError as e:
            # Telegram rate limit - specific time
            print(f"🚫 FloodWait for {e.seconds}s")
            await self.safety.handle_flood_wait(account_id, e.seconds)
            return "flood_wait"
        
        except ForbiddenError as e:
            # Check for PRIVACY_PREMIUM_REQUIRED error
            error_msg = str(e)
            if "PRIVACY_PREMIUM_REQUIRED" in error_msg:
                print(f"🔒 User @{username} requires Telegram Premium to receive messages")
                return "privacy_premium"
            else:
                print(f"🚫 Forbidden error: {e}")
                return "forbidden"
            
        except PeerFloodError:
            # Too many messages sent - ban for several hours
            print(f"🚫🚫 PeerFlood detected - account banned for spam!")
            print(f"   Account {account_id} will be paused for 24 hours")
            # Pause for 24 hours (86400 seconds)
            await self.safety.handle_flood_wait(account_id, 86400)
            return "peer_flood"
            
        except ChatWriteForbiddenError:
            # Can't write to this user/chat (probably a channel or bot)
            print(f"⚠️ Cannot write to @{username} - might be a channel or restricted")
            return "forbidden"
            
        except UserBannedInChannelError:
            # Account permanently banned
            print(f"🔒 Account {account_id} permanently banned")
            await self.safety.handle_account_ban(account_id)
            return "banned"
            
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            import traceback
            traceback.print_exc()
            return "error"
    
    async def _setup_message_listener(self, account_id: str, client: TelegramClient):
        """
        Setup listener for incoming messages
        """
        @client.on(events.NewMessage(incoming=True))
        async def handler(event):
            # Call registered callback if exists
            if account_id in self.event_handlers:
                await self.event_handlers[account_id](event)
        
        print(f"👂 Listening for messages on account {account_id}")
    
    def register_message_callback(self, account_id: str, callback: Callable):
        """
        Register callback for incoming messages on specific account
        
        Args:
            account_id: Account ID
            callback: Async function to call on new message
        """
        self.event_handlers[account_id] = callback
    
    async def get_user_info(self, account_id: str, username: str) -> Optional[Dict]:
        """
        Get user information
        
        Args:
            account_id: Account to use
            username: Target username
        
        Returns:
            User info dict or None, or False if it's a channel
        """
        client = self.clients.get(account_id)
        if not client:
            return None
        
        try:
            entity = await client.get_entity(username)
            
            # Check if it's a channel/group (not a user)
            if hasattr(entity, 'broadcast') or hasattr(entity, 'megagroup'):
                print(f"⚠️ @{username} is a channel/group, not a user")
                return False
            
            # It's a user - return info
            return {
                'id': entity.id,
                'username': getattr(entity, 'username', None),
                'first_name': getattr(entity, 'first_name', ''),
                'last_name': getattr(entity, 'last_name', ''),
                'phone': getattr(entity, 'phone', None)
            }
        except Exception as e:
            print(f"❌ Error getting user info: {e}")
            return None
    
    async def close_all(self):
        """Close all Telethon clients"""
        for account_id, client in self.clients.items():
            try:
                await client.disconnect()
                print(f"👋 Disconnected account {account_id}")
            except Exception as e:
                print(f"⚠️ Error disconnecting {account_id}: {e}")
        
        self.clients.clear()



