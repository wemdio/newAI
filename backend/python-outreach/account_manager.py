from telethon import TelegramClient
from telethon.sessions import StringSession
from loguru import logger
import python_socks
from urllib.parse import urlparse

class AccountManager:
    def __init__(self, account_data):
        self.account_data = account_data
        self.phone = account_data.get('phone_number')
        self.api_id = account_data.get('api_id')
        self.api_hash = account_data.get('api_hash')
        self.session_string = account_data.get('session_string')
        self.proxy_url = account_data.get('proxy_url')
        self.client = None

    def _parse_proxy(self):
        if not self.proxy_url:
            return None
        
        try:
            parsed = urlparse(self.proxy_url)
            if parsed.scheme not in ['socks5', 'http', 'https']:
                return None

            # Determine proxy type using python_socks constants
            if parsed.scheme == 'socks5':
                p_type = python_socks.ProxyType.SOCKS5
            elif parsed.scheme == 'http' or parsed.scheme == 'https':
                p_type = python_socks.ProxyType.HTTP
            else:
                return None

            # RETURN A TUPLE OF 5 ELEMENTS: (type, host, port, user, pass)
            return (
                p_type,
                parsed.hostname,
                parsed.port,
                parsed.username,
                parsed.password
            )
        except Exception as e:
            logger.error(f"Failed to parse proxy {self.proxy_url}: {e}")
            return None

    async def check_proxy(self):
        """Verifies proxy connectivity before Telegram connection."""
        if not self.proxy_url:
            return True # No proxy = OK (direct connection)
        
        # TODO: Implement actual proxy connectivity check (e.g. requests.get('http://google.com', proxies=...))
        return True

    async def connect(self):
        """Connects to Telegram using the session string."""
        if not self.session_string:
            logger.error(f"No session string for {self.phone}")
            return False

        proxy = self._parse_proxy()
        
        try:
            self.client = TelegramClient(
                StringSession(self.session_string),
                self.api_id,
                self.api_hash,
                proxy=proxy,
                device_model="Desktop",
                system_version="Windows 10",
                app_version="1.0.0",
                lang_code="en"
            )
            
            await self.client.connect()
            
            if not await self.client.is_user_authorized():
                logger.error(f"Session invalid or unauthorized for {self.phone}")
                await self.client.disconnect()
                return False
                
            me = await self.client.get_me()
            logger.info(f"Connected as {me.username} ({self.phone})")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed for {self.phone}: {e}")
            return False

    async def disconnect(self):
        if self.client:
            await self.client.disconnect()
            logger.info(f"Disconnected {self.phone}")

    async def send_message(self, target, message):
        """Sends a message to a target (username or phone)."""
        if not self.client or not await self.client.is_user_authorized():
            logger.error("Client not connected or authorized")
            return False, "Not connected"

        try:
            # Resolve entity first
            entity = await self.client.get_entity(target)
            await self.client.send_message(entity, message)
            logger.info(f"Sent message to {target}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to send to {target}: {error_msg}")
            return False, error_msg