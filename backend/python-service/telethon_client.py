"""Telethon Client Manager - Handles Telegram connections and messaging"""
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    FloodWaitError, 
    UserBannedInChannelError,
    AuthKeyUnregisteredError,
    SessionPasswordNeededError
)
from urllib.parse import urlparse
from typing import Dict, Optional, Callable
import asyncio
import os


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
        
        Format: protocol://username:password@host:port
        Example: socks5://user:pass@1.2.3.4:1080
        """
        if not proxy_url:
            return None
        
        try:
            parsed = urlparse(proxy_url)
            
            # Map protocol
            protocol_map = {
                'socks5': 'socks5',
                'socks4': 'socks4',
                'http': 'http',
                'https': 'http'
            }
            
            proxy_type = protocol_map.get(parsed.scheme)
            if not proxy_type:
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
    
    async def send_message(self, account_id: str, username: str, message: str) -> bool:
        """
        Send message to user
        
        Args:
            account_id: Account to use
            username: Target username (without @)
            message: Message text
        
        Returns:
            True if sent successfully, False otherwise
        """
        client = self.clients.get(account_id)
        if not client:
            print(f"❌ Client {account_id} not initialized")
            return False
        
        try:
            # Send message
            await client.send_message(username, message)
            print(f"✉️ Sent message to @{username}")
            return True
            
        except FloodWaitError as e:
            # Telegram rate limit
            print(f"🚫 FloodWait for {e.seconds}s")
            await self.safety.handle_flood_wait(account_id, e.seconds)
            return False
            
        except UserBannedInChannelError:
            # Account banned
            print(f"🔒 Account {account_id} banned")
            await self.safety.handle_account_ban(account_id)
            return False
            
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            return False
    
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
            User info dict or None
        """
        client = self.clients.get(account_id)
        if not client:
            return None
        
        try:
            entity = await client.get_entity(username)
            return {
                'id': entity.id,
                'username': entity.username,
                'first_name': entity.first_name,
                'last_name': entity.last_name,
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



