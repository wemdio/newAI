"""Telethon Client Manager - Handles Telegram connections and messaging"""
from telethon import TelegramClient, events
from telethon.errors import (
    FloodWaitError, 
    UserBannedInChannelError,
    AuthKeyUnregisteredError,
    SessionPasswordNeededError
)
from urllib.parse import urlparse
from typing import Dict, Optional, Callable
import asyncio


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



