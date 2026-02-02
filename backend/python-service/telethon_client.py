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
from telethon.errors.common import TypeNotFoundError
from telethon.errors.rpcbaseerrors import ForbiddenError
from urllib.parse import urlparse
import re
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
        self.locks: Dict[str, asyncio.Lock] = {}  # {account_id: lock}
    
    def _get_lock(self, account_id: str) -> asyncio.Lock:
        """Get or create a lock for a specific account"""
        if account_id not in self.locks:
            self.locks[account_id] = asyncio.Lock()
        return self.locks[account_id]

    async def init_account(self, account: Dict) -> bool:
        """
        Initialize Telethon client for an account (with lock)
        """
        account_id = str(account['id'])
        lock = self._get_lock(account_id)
        async with lock:
            return await self._init_account_internal(account)

    async def _init_account_internal(self, account: Dict) -> bool:
        """
        Internal initialization (without lock)
        """
        account_id = str(account['id'])
        if account_id in self.clients and self.clients[account_id].is_connected():
            return True
            
        session_file = f"sessions/{account['session_file']}"
        
        try:
            # Create sessions directory if it doesn't exist
            os.makedirs('sessions', exist_ok=True)
            
            # Check if we have session_string
            session_string_data = account.get('session_string')
            session_spec = session_file
            if session_string_data:
                print(f"🔧 Processing session_string for {account['account_name']}")
                
                # Normalize (remove whitespace/newlines)
                session_str = re.sub(r'\s+', '', session_string_data).strip()
                session_file_path = f"{session_file}.session"
                
                # If it contains ':' it's likely hex:dc format from account shop
                # We need to create a session file from it
                if ':' in session_str:
                    if not os.path.exists(session_file_path):
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
                            
                            conn = sqlite3.connect(session_file_path)
                            
                            # Create all necessary tables for Telethon
                            conn.execute('''CREATE TABLE sessions (
                                dc_id INTEGER PRIMARY KEY,
                                server_address TEXT,
                                port INTEGER,
                                auth_key BLOB,
                                takeout_id INTEGER
                            )''')
                            
                            conn.execute('''CREATE TABLE entities (
                                id INTEGER PRIMARY KEY,
                                hash INTEGER NOT NULL,
                                username TEXT,
                                phone INTEGER,
                                name TEXT,
                                date INTEGER
                            )''')
                            
                            conn.execute('''CREATE TABLE sent_files (
                                md5_digest BLOB,
                                file_size INTEGER,
                                type INTEGER,
                                id INTEGER,
                                hash INTEGER,
                                PRIMARY KEY(md5_digest, file_size, type)
                            )''')
                            
                            conn.execute('''CREATE TABLE update_state (
                                id INTEGER PRIMARY KEY,
                                pts INTEGER,
                                qts INTEGER,
                                date INTEGER,
                                seq INTEGER
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
                                'INSERT INTO sessions VALUES (?, ?, ?, ?, ?)',
                                (dc_id, server_addr, port, auth_key_bytes, None)
                            )
                            conn.commit()
                            conn.close()
                            
                            print(f"   ✅ Created session file from hex:dc format")
                            
                        except Exception as e:
                            print(f"   ❌ Failed to convert hex:dc to session: {e}")
                            import traceback
                            traceback.print_exc()
                            return False
                    session_spec = session_file
                else:
                    # Try hex-encoded StringSession first (common in DB)
                    session_spec = None
                    is_hex = re.fullmatch(r'[0-9a-fA-F]+', session_str) is not None
                    if is_hex and len(session_str) % 2 == 0:
                        try:
                            decoded_bytes = bytes.fromhex(session_str)
                            try:
                                decoded_str = decoded_bytes.decode('utf-8')
                            except UnicodeDecodeError:
                                decoded_str = None
                            
                            if decoded_str and re.fullmatch(r'[0-9A-Za-z_-]+', decoded_str):
                                try:
                                    session_spec = StringSession(decoded_str)
                                    print("   Detected hex-encoded StringSession format")
                                except Exception as e:
                                    print(f"   ⚠️ Hex decoded string is not a valid StringSession: {e}")
                            else:
                                print("   ⚠️ Hex string does not decode to a StringSession")
                        except Exception as e:
                            print(f"   ⚠️ Failed to decode hex session string: {e}")
                    
                    # Fallback: use raw StringSession
                    if session_spec is None:
                        try:
                            session_spec = StringSession(session_str)
                            print("   Detected Telethon StringSession format")
                        except Exception as e:
                            print(f"   ❌ Invalid StringSession format: {e}")
                            # If a session file already exists, use it as fallback
                            if os.path.exists(session_file_path):
                                print("   ⚠️ Falling back to existing session file")
                                session_spec = session_file
                            elif is_hex:
                                print("   ⚠️ Hex string may be auth key without DC. Use hex:dc_id format.")
                                return False
                            else:
                                return False
            
            # PROXY IS MANDATORY - Check if proxy is configured
            proxy_url = account.get('proxy_url')
            if not proxy_url:
                print(f"❌ No proxy configured for account {account['account_name']}")
                print(f"   ⚠️ PROXY IS MANDATORY - accounts without proxy cannot be used")
                await self.supabase.mark_account_error(
                    account_id,
                    "No proxy configured. Proxy is required for all accounts."
                )
                return False
            
            # Parse proxy
            proxy = self._parse_proxy(proxy_url)
            if not proxy:
                print(f"❌ Invalid proxy format for account {account['account_name']}: {proxy_url}")
                await self.supabase.mark_account_error(
                    account_id,
                    f"Invalid proxy format: {proxy_url}"
                )
                return False
            
            # Check proxy connection before proceeding
            proxy_works = await self._check_proxy(proxy)
            if not proxy_works:
                print(f"❌ Proxy verification failed for account {account['account_name']}")
                print(f"   Cannot connect to Telegram through proxy: {proxy_url}")
                # Mark account as error in database
                await self.supabase.mark_account_error(
                    account_id,
                    f"Proxy connection failed: {proxy_url}"
                )
                return False
            
            print(f"✅ Proxy verified: {proxy['addr']}:{proxy['port']}")
            
            # Create client
            client = TelegramClient(
                session_spec,
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
            
            # Check spam status with SpamBot
            print(f"🔍 Checking spam status via @SpamBot...")
            spam_status = await self.check_spam_status_internal(account_id)
            
            # Update account status in database based on SpamBot response
            if spam_status['status'] == 'banned':
                print(f"⚠️ Account is permanently limited, marking as banned")
                await self.supabase.mark_account_banned(account_id)
            elif spam_status['status'] == 'spam_blocked':
                print(f"⏳ Account is temporarily blocked for {spam_status['wait_time']}s")
                await self.safety.handle_flood_wait(account_id, spam_status['wait_time'])
            else:
                print(f"✅ Account spam status: clean")
            
            # Setup message listener
            await self._setup_message_listener(account_id, client)
            
            return True
            
        except AuthKeyUnregisteredError:
            print(f"❌ Account {account_id} auth key unregistered (banned or deleted)")
            await self.safety.handle_account_ban(account_id)
            return False
        except TypeNotFoundError as e:
            print(f"❌ TypeNotFoundError for account {account_id}: {e}")
            print(f"   This usually means Telethon version is outdated or session is corrupted")
            print(f"   Please update Telethon and re-import the session")
            await self.supabase.mark_account_error(
                account_id,
                f"Session incompatible: TypeNotFoundError. Update Telethon or re-import session."
            )
            return False
        except Exception as e:
            print(f"❌ Error initializing account {account_id}: {e}")
            import traceback
            traceback.print_exc()
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
                    # But we can try to infer or just stick to socks5
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
            
            # Fallback for common formats without scheme but not matching ip:port:user:pass
            if not proxy_type:
                # If parsing failed to find scheme, maybe it is user:pass@ip:port
                if '@' in proxy_url and not parsed.scheme:
                     # Try adding socks5:// and re-parse
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
    
    async def check_spam_status(self, account_id: str) -> Dict:
        """
        Check account spam status via @SpamBot (with lock)
        """
        lock = self._get_lock(account_id)
        async with lock:
            return await self.check_spam_status_internal(account_id)

    async def check_spam_status_internal(self, account_id: str) -> Dict:
        """
        Internal spam status check (without lock)
        """
        client = self.clients.get(account_id)
        if not client:
            print(f"❌ Client {account_id} not initialized for spam check")
            return {'is_limited': False, 'status': 'active', 'wait_time': 0, 'message': 'Client not initialized'}
        
        # Ensure connected
        if not client.is_connected():
            try:
                await client.connect()
            except Exception as e:
                print(f"❌ Failed to connect client {account_id} for spam check: {e}")
                return {'is_limited': False, 'status': 'active', 'wait_time': 0, 'message': f'Connect error: {e}'}
        
        try:
            print(f"🔍 Checking spam status for account {account_id}...")
            
            # Send /start to SpamBot
            await client.send_message('SpamBot', '/start')
            
            # Wait for response (max 10 seconds)
            response = None
            async for message in client.iter_messages('SpamBot', limit=1):
                response = message.message
                break
            
            if not response:
                print(f"⚠️ No response from SpamBot")
                return {'is_limited': False, 'status': 'active', 'wait_time': 0, 'message': 'No response'}
            
            print(f"📩 SpamBot response: {response[:200]}")
            
            # Parse response
            response_lower = response.lower()
            
            # Check for different statuses (order matters!)
            
            # Check for BANNED first (most severe)
            if 'blocked' in response_lower or 'violations' in response_lower or 'terms of service' in response_lower:
                # Permanent ban
                print(f"🚫 Account {account_id} is PERMANENTLY BANNED by Telegram")
                return {
                    'is_limited': True,
                    'status': 'banned',
                    'wait_time': 0,  # Permanent
                    'message': response
                }
            
            # Check for CLEAN status
            elif 'all good' in response_lower or 'not limited' in response_lower or 'free as a bird' in response_lower:
                # No restrictions
                print(f"✅ Account {account_id} is clean (no spam block)")
                return {
                    'is_limited': False,
                    'status': 'active',
                    'wait_time': 0,
                    'message': response
                }
            
            # Check for TEMPORARY spam block
            elif 'temporarily limited' in response_lower or 'wait' in response_lower:
                # Temporary spam block (PeerFlood)
                print(f"⏳ Account {account_id} is temporarily limited")
                
                # Try to extract wait time from message
                wait_time = 86400  # Default 24 hours
                
                # Look for patterns like "wait 24 hours" or "in 12 hours"
                import re
                hours_match = re.search(r'(\d+)\s*hour', response_lower)
                if hours_match:
                    hours = int(hours_match.group(1))
                    wait_time = hours * 3600
                    print(f"   Found wait time: {hours} hours ({wait_time}s)")
                
                return {
                    'is_limited': True,
                    'status': 'spam_blocked',
                    'wait_time': wait_time,
                    'message': response
                }
            
            # Check for GENERAL limitation (catch-all)
            elif 'limited' in response_lower or 'restricted' in response_lower:
                # Permanent or serious limitation
                print(f"🚫 Account {account_id} is permanently limited")
                return {
                    'is_limited': True,
                    'status': 'banned',
                    'wait_time': 0,  # Permanent
                    'message': response
                }
            
            else:
                # Unknown response
                print(f"⚠️ Unknown SpamBot response: {response[:100]}")
                return {
                    'is_limited': False,
                    'status': 'active',
                    'wait_time': 0,
                    'message': response
                }
                
        except Exception as e:
            print(f"❌ Error checking spam status: {e}")
            return {
                'is_limited': False,
                'status': 'active',
                'wait_time': 0,
                'message': f'Error: {str(e)}'
            }
    
    async def send_message(self, account_id: str, username: str, message: str, account: Dict = None) -> str:
        """
        Send message to user
        
        Args:
            account_id: Account to use
            username: Target username (without @)
            message: Message text
            account: Account dict with proxy info (optional, for re-verification)
        
        Returns:
            "success" - message sent
            "privacy_premium" - user requires Telegram Premium to receive messages
            "flood_wait" - rate limited
            "peer_flood" - spam ban
            "forbidden" - can't write to user
            "banned" - account banned
            "error" - other error
        """
        lock = self._get_lock(account_id)
        async with lock:
            client = self.clients.get(account_id)
            if not client:
                print(f"❌ Client {account_id} not initialized")
                return "error"
            
            # Ensure connected
            if not client.is_connected():
                try:
                    await client.connect()
                except Exception as e:
                    print(f"❌ Failed to connect client {account_id} before sending: {e}")
                    return "error"
            
            # Re-verify proxy before sending if account info provided
            if account and account.get('proxy_url'):
                proxy = self._parse_proxy(account.get('proxy_url'))
                if proxy:
                    proxy_works = await self._check_proxy(proxy)
                    if not proxy_works:
                        print(f"❌ Proxy check failed before sending - marking account as error")
                        await self.supabase.mark_account_error(
                            account_id,
                            f"Proxy stopped working: {account.get('proxy_url')}"
                        )
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
                print(f"🚫 Forbidden error for @{username}: {e}")
                return "forbidden"
            
        except PeerFloodError:
            # Too many messages sent - ban for several hours
            print(f"🚫🚫 PeerFlood detected - checking SpamBot for exact ban duration...")
            
            # Check SpamBot for accurate wait time
            spam_status = await self.check_spam_status(account_id)
            
            wait_time = spam_status.get('wait_time', 86400)  # Default 24h if can't determine
            status = spam_status.get('status', 'spam_blocked')
            
            # IMPORTANT: PeerFlood can happen even when SpamBot says "clean"
            # This is Telegram's rate limiting for new accounts or writing to strangers
            # If SpamBot says "active" but PeerFlood occurred, enforce minimum 24h cooldown
            if status == 'active' and wait_time == 0:
                wait_time = 86400  # Force 24h cooldown for PeerFlood
                print(f"   ⚠️ PeerFlood despite clean SpamBot status - enforcing 24h cooldown")
            
            print(f"   SpamBot says: {status}, wait time: {wait_time}s ({wait_time/3600:.1f}h)")
            
            # Update account status in database
            if status == 'banned':
                await self.supabase.mark_account_banned(account_id)
            else:
                await self.safety.handle_flood_wait(account_id, wait_time)
            
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
            
        except TypeNotFoundError as e:
            # Telethon version mismatch or corrupted session data
            print(f"⚠️ TypeNotFoundError for account {account_id}: {e}")
            print(f"   This usually means Telethon needs to be updated or session is corrupted")
            print(f"   Marking account as error - please re-import the session")
            await self.supabase.mark_account_error(
                account_id,
                f"Session incompatible: TypeNotFoundError. Please re-import session."
            )
            return "error"
            
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

    async def ensure_connected(self, account_id: str) -> bool:
        """
        Ensure client is connected. Attempts to reconnect if disconnected.
        
        Args:
            account_id: Account ID
            
        Returns:
            True if connected (or reconnected successfully), False otherwise
        """
        client = self.clients.get(account_id)
        if not client:
            return False
            
        if not client.is_connected():
            print(f"⚠️ Client {account_id} disconnected, attempting to reconnect...")
            try:
                await client.connect()
                if not await client.is_user_authorized():
                    print(f"❌ Client {account_id} reconnected but not authorized")
                    return False
                print(f"✅ Client {account_id} reconnected successfully")
                return True
            except Exception as e:
                print(f"❌ Failed to reconnect client {account_id}: {e}")
                return False
                
        return True
    
    async def get_user_info(self, account_id: str, username: str) -> Optional[Dict]:
        """
        Get user information (with lock)
        """
        lock = self._get_lock(account_id)
        async with lock:
            client = self.clients.get(account_id)
            if not client:
                return None
            
            # Ensure connected
            if not client.is_connected():
                try:
                    await client.connect()
                except Exception as e:
                    print(f"❌ Failed to connect client {account_id} for user info: {e}")
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
    
    async def reconnect_account(self, account_id: str, account: Dict) -> bool:
        """
        Reconnect a specific account (e.g., after proxy change)
        
        Args:
            account_id: Account ID to reconnect
            account: Fresh account data from database
        
        Returns:
            True if successful, False otherwise
        """
        lock = self._get_lock(account_id)
        async with lock:
            print(f"🔄 Reconnecting account {account_id} with new settings...")
            
            # Close existing client if it exists
            if account_id in self.clients:
                try:
                    await self.clients[account_id].disconnect()
                    print(f"   ✅ Disconnected old client")
                except Exception as e:
                    print(f"   ⚠️ Error disconnecting old client: {e}")
                
                # Remove from clients dict
                del self.clients[account_id]
                
                # Remove message handler
                if account_id in self.event_handlers:
                    del self.event_handlers[account_id]
            
            # Initialize with new settings
            # We are already inside the lock, but init_account also uses it.
            # To avoid deadlock, we need to be careful. 
            # Actually, init_account uses 'async with lock', which is re-entrant? No, it's NOT re-entrant in asyncio.
            # I will refactor init_account to have an internal method without lock.
            success = await self._init_account_internal(account)
            
            if success:
                print(f"   ✅ Account {account_id} reconnected successfully")
            else:
                print(f"   ❌ Failed to reconnect account {account_id}")
            
            return success
    
    async def close_all(self):
        """Close all Telethon clients"""
        for account_id, client in self.clients.items():
            try:
                await client.disconnect()
                print(f"👋 Disconnected account {account_id}")
            except Exception as e:
                print(f"⚠️ Error disconnecting {account_id}: {e}")
        
        self.clients.clear()



