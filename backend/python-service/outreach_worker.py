"""
Outreach Worker - Automatic cold outreach and AI response handler

This worker handles:
1. Sending initial messages to targets in active campaigns
2. Monitoring for replies and responding with AI
3. Managing conversation state and lead detection
"""
import asyncio
import base64
import os
import sys
import random
import json
import tempfile
import socket
from urllib.parse import urlparse
import httpx
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

from config import LOG_LEVEL, SUPABASE_URL, SUPABASE_KEY, setup_logger

logger = setup_logger('OutreachWorker')

BOT_USERNAME_PREFIXES = ('i7', 'i8')
DEFAULT_TRIGGER_PHRASE_POSITIVE = "Отлично, рад, что смог вас заинтересовать"
DEFAULT_TRIGGER_PHRASE_NEGATIVE = "Вижу, что не смог вас заинтересовать"
DEFAULT_FORWARD_LIMIT = 5
DEFAULT_HISTORY_LIMIT = 20


def _parse_sleep_periods(periods: Any) -> List[str]:
    if not periods:
        return []
    if isinstance(periods, str):
        raw_parts = periods.split(',')
    elif isinstance(periods, list):
        raw_parts = []
        for item in periods:
            if item is None:
                continue
            item_str = str(item)
            if ',' in item_str:
                raw_parts.extend(item_str.split(','))
            else:
                raw_parts.append(item_str)
    else:
        return []
    return [part.strip() for part in raw_parts if part.strip()]


def _get_local_time(timezone_offset: int) -> datetime:
    return datetime.utcnow() + timedelta(hours=timezone_offset)


def _parse_sleep_period(period_str: str):
    try:
        start_str, end_str = period_str.strip().split('-')
        start_hour, start_min = map(int, start_str.strip().split(':'))
        end_hour, end_min = map(int, end_str.strip().split(':'))
        return (start_hour, start_min), (end_hour, end_min)
    except Exception:
        return None


def _is_sleep_time(periods: List[str], timezone_offset: int) -> bool:
    if not periods:
        return False
    now = _get_local_time(timezone_offset).time()
    for period in periods:
        parsed = _parse_sleep_period(period)
        if not parsed:
            continue
        (start_hour, start_min), (end_hour, end_min) = parsed
        start = datetime.strptime(f"{start_hour:02d}:{start_min:02d}", "%H:%M").time()
        end = datetime.strptime(f"{end_hour:02d}:{end_min:02d}", "%H:%M").time()
        if start > end:
            if now >= start or now <= end:
                return True
        else:
            if start <= now <= end:
                return True
    return False


def _safe_iso_date(value: Any) -> Optional[datetime.date]:
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return value.date()
        return datetime.fromisoformat(str(value)).date()
    except Exception:
        return None


def _safe_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None


def _normalize_range(min_value: Any, max_value: Any, default_min: int, default_max: int) -> tuple[int, int]:
    try:
        min_val = int(min_value)
    except Exception:
        min_val = default_min
    try:
        max_val = int(max_value)
    except Exception:
        max_val = default_max
    return min(min_val, max_val), max(min_val, max_val)

def _normalize_username(value: Any) -> str:
    if not value:
        return ''
    return str(value).strip().lstrip('@').lower()

# Telethon imports
try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.errors import (
        FloodWaitError, PeerFloodError, UserPrivacyRestrictedError,
        UserNotMutualContactError, ChatWriteForbiddenError,
        AuthKeyUnregisteredError, SessionPasswordNeededError
    )
    from telethon.tl.types import User
    TELETHON_AVAILABLE = True
except ImportError:
    TELETHON_AVAILABLE = False
    logger.warning("âš ï¸ Telethon not installed - outreach will not work")

try:
    import socks
    SOCKS_LIB_AVAILABLE = True
except ImportError:
    SOCKS_LIB_AVAILABLE = False
    socks = None


class OutreachSupabaseClient:
    """Supabase client for outreach operations"""
    
    def __init__(self, url: str, key: str):
        self.url = url.rstrip('/')
        self.key = key
        self.headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        self.client: Optional[httpx.AsyncClient] = None
    
    async def connect(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        logger.info("âœ… Supabase client connected")
    
    async def close(self):
        if self.client:
            await self.client.aclose()
    
    async def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Any]:
        """Make a request to Supabase REST API"""
        try:
            url = f"{self.url}/rest/v1/{endpoint}"
            headers = self.headers
            if 'headers' in kwargs:
                headers = {**self.headers, **kwargs.pop('headers')}
            resp = await self.client.request(method, url, headers=headers, **kwargs)
            
            if resp.status_code >= 400:
                logger.error(f"Supabase error: {resp.status_code} - {resp.text}")
                return None
            
            if resp.status_code == 204:
                return True
            
            return resp.json() if resp.text else None
        except Exception as e:
            logger.error(f"Supabase request error: {e}")
            return None
    
    # ===== CAMPAIGNS =====
    
    async def get_active_outreach_campaigns(self) -> List[dict]:
        """Get all active outreach campaigns"""
        data = await self._request(
            'GET',
            'outreach_campaigns?status=eq.active&select=*'
        )
        return data or []
    
    async def update_campaign(self, campaign_id: str, updates: dict) -> bool:
        """Update campaign fields"""
        result = await self._request(
            'PATCH',
            f'outreach_campaigns?id=eq.{campaign_id}',
            json=updates
        )
        return result is not None
    
    async def increment_campaign_sent(self, campaign_id: str) -> bool:
        """Increment messages_sent counter atomically using RPC or direct update"""
        # First get current value
        data = await self._request(
            'GET',
            f'outreach_campaigns?id=eq.{campaign_id}&select=messages_sent'
        )
        if data and len(data) > 0:
            current = data[0].get('messages_sent') or 0
            return await self.update_campaign(campaign_id, {'messages_sent': current + 1})
        return False
    
    async def increment_campaign_replied(self, campaign_id: str) -> bool:
        """Increment messages_replied counter"""
        data = await self._request(
            'GET',
            f'outreach_campaigns?id=eq.{campaign_id}&select=messages_replied'
        )
        if data and len(data) > 0:
            current = data[0].get('messages_replied') or 0
            return await self.update_campaign(campaign_id, {'messages_replied': current + 1})
        return False
    
    # ===== ACCOUNTS =====
    
    async def get_outreach_accounts(self, account_ids: List[str]) -> List[dict]:
        """Get accounts by IDs"""
        if not account_ids:
            return []
        
        ids_param = ','.join(account_ids)
        data = await self._request(
            'GET',
            f'outreach_accounts?id=in.({ids_param})&status=eq.active&select=*'
        )
        return data or []

    async def get_outreach_account_by_id(self, account_id: str) -> Optional[dict]:
        """Get account by ID"""
        if not account_id:
            return None
        data = await self._request(
            'GET',
            f'outreach_accounts?id=eq.{account_id}&select=*'
        )
        return data[0] if data else None
    
    async def update_account_status(self, account_id: str, status: str, error: str = None) -> bool:
        """Update account status"""
        updates = {'status': status, 'last_active_at': datetime.utcnow().isoformat()}
        if error:
            updates['error_message'] = error
        
        result = await self._request(
            'PATCH',
            f'outreach_accounts?id=eq.{account_id}',
            json=updates
        )
        return result is not None

    async def update_account_fields(self, account_id: str, updates: dict) -> bool:
        """Update arbitrary account fields"""
        if not updates:
            return True
        result = await self._request(
            'PATCH',
            f'outreach_accounts?id=eq.{account_id}',
            json=updates
        )
        return result is not None

    async def reactivate_expired_cooldowns(self) -> int:
        """Reactivate accounts whose cooldown has expired"""
        now_iso = datetime.utcnow().isoformat()
        data = await self._request(
            'PATCH',
            f'outreach_accounts?status=eq.paused&cooldown_until=lte.{now_iso}',
            json={'status': 'active', 'error_message': None}
        )
        if isinstance(data, list):
            return len(data)
        return 0

    async def reset_daily_counters(self, today: datetime.date) -> int:
        """Reset daily counters for accounts from previous days"""
        today_str = today.isoformat()
        data = await self._request(
            'PATCH',
            f'outreach_accounts?last_sent_date=lt.{today_str}',
            json={'messages_sent_today': 0}
        )
        if isinstance(data, list):
            return len(data)
        return 0
    
    # ===== TARGETS =====
    
    async def get_pending_targets(self, campaign_id: str, limit: int = 10) -> List[dict]:
        """Get pending targets for a campaign"""
        data = await self._request(
            'GET',
            f'outreach_targets?campaign_id=eq.{campaign_id}&status=eq.pending&select=*&limit={limit}'
        )
        return data or []
    
    async def update_target(self, target_id: str, updates: dict) -> bool:
        """Update target status"""
        result = await self._request(
            'PATCH',
            f'outreach_targets?id=eq.{target_id}',
            json=updates
        )
        return result is not None

    async def update_target_by_username(
        self,
        campaign_id: str,
        username: str,
        updates: dict
    ) -> bool:
        """Update target by campaign and username"""
        if not username:
            return False
        result = await self._request(
            'PATCH',
            f'outreach_targets?campaign_id=eq.{campaign_id}&username=eq.{username}',
            json=updates
        )
        return result is not None

    async def get_processed_clients(self, campaign_id: str) -> List[dict]:
        """Get processed clients for a campaign"""
        data = await self._request(
            'GET',
            f'outreach_processed_clients?campaign_id=eq.{campaign_id}&select=target_username'
        )
        return data or []

    async def add_processed_client(
        self,
        user_id: str,
        campaign_id: str,
        target_username: str,
        target_name: str = None
    ) -> bool:
        """Add processed client (upsert)"""
        if not target_username:
            return False
        payload = {
            'user_id': user_id,
            'campaign_id': campaign_id,
            'target_username': target_username,
            'target_name': target_name
        }
        result = await self._request(
            'POST',
            'outreach_processed_clients?on_conflict=campaign_id,target_username',
            json=payload,
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'}
        )
        return result is not None
    
    # ===== CHATS =====
    
    async def get_or_create_chat(self, user_id: str, account_id: str, campaign_id: str, 
                                  target_username: str, target_name: str = None) -> Optional[dict]:
        """Get or create a chat record"""
        # Try to find existing
        data = await self._request(
            'GET',
            f'outreach_chats?account_id=eq.{account_id}&target_username=eq.{target_username}&select=*'
        )
        
        if data and len(data) > 0:
            return data[0]
        
        # Create new
        chat_data = {
            'user_id': user_id,
            'account_id': account_id,
            'campaign_id': campaign_id,
            'target_username': target_username,
            'target_name': target_name,
            'status': 'active',
            'unread_count': 0
        }
        
        result = await self._request('POST', 'outreach_chats', json=chat_data)
        return result[0] if result else None
    
    async def update_chat(self, chat_id: str, updates: dict) -> bool:
        """Update chat record"""
        result = await self._request(
            'PATCH',
            f'outreach_chats?id=eq.{chat_id}',
            json=updates
        )
        return result is not None

    async def mark_follow_up_sent(self, chat_id: str) -> bool:
        """Mark follow-up as sent for a chat"""
        return await self.update_chat(chat_id, {'follow_up_sent_at': datetime.utcnow().isoformat()})
    
    async def increment_unread(self, chat_id: str) -> bool:
        """Increment unread count for a chat"""
        data = await self._request(
            'GET',
            f'outreach_chats?id=eq.{chat_id}&select=unread_count'
        )
        if data and len(data) > 0:
            current = data[0].get('unread_count') or 0
            return await self.update_chat(chat_id, {'unread_count': current + 1})
        return False
    
    async def get_active_chats_for_campaign(self, campaign_id: str) -> List[dict]:
        """Get all active chats for a campaign (for checking replies)"""
        data = await self._request(
            'GET',
            f'outreach_chats?campaign_id=eq.{campaign_id}&status=eq.active&select=*'
        )
        return data or []
    
    async def get_chats_with_unread(self, user_id: str) -> List[dict]:
        """Get chats with unread messages for AI processing"""
        data = await self._request(
            'GET',
            f'outreach_chats?user_id=eq.{user_id}&unread_count=gt.0&status=eq.active&select=*'
        )
        return data or []
    
    # ===== MESSAGES =====
    
    async def add_message(self, chat_id: str, sender: str, content: str) -> bool:
        """Add message to chat"""
        msg_data = {
            'chat_id': chat_id,
            'sender': sender,
            'content': content
        }
        
        result = await self._request('POST', 'outreach_messages', json=msg_data)
        
        # Update chat last_message_at
        if result:
            await self._request(
                'PATCH',
                f'outreach_chats?id=eq.{chat_id}',
                json={
                    'last_message_at': datetime.utcnow().isoformat(),
                    'last_message_sender': sender
                }
            )
        
        return result is not None
    
    async def get_chat_messages(self, chat_id: str, limit: int = 50) -> List[dict]:
        """Get messages for a chat"""
        data = await self._request(
            'GET',
            f'outreach_messages?chat_id=eq.{chat_id}&select=*&order=created_at.asc&limit={limit}'
        )
        return data or []
    
    async def get_last_message_id(self, chat_id: str) -> Optional[int]:
        """Get the ID of the last processed message"""
        data = await self._request(
            'GET',
            f'outreach_messages?chat_id=eq.{chat_id}&select=id&order=created_at.desc&limit=1'
        )
        if data and len(data) > 0:
            return data[0].get('id')
        return None

    async def get_pending_manual_messages(self, limit: int = 10) -> List[dict]:
        """Get pending manual messages"""
        data = await self._request(
            'GET',
            f'outreach_manual_messages?status=eq.pending&select=*&order=created_at.asc&limit={limit}'
        )
        return data or []

    async def update_manual_message(self, message_id: str, updates: dict) -> bool:
        """Update manual message status"""
        result = await self._request(
            'PATCH',
            f'outreach_manual_messages?id=eq.{message_id}',
            json=updates
        )
        return result is not None
    
    # ===== LOGS =====
    
    async def log(self, user_id: str, level: str, message: str, 
                  campaign_id: str = None, account_id: str = None, metadata: dict = None):
        """Add log entry"""
        log_data = {
            'user_id': user_id,
            'level': level,
            'message': message,
            'metadata': metadata or {}
        }
        if campaign_id:
            log_data['campaign_id'] = campaign_id
        if account_id:
            log_data['account_id'] = account_id
        
        await self._request('POST', 'outreach_logs', json=log_data)
    
    # ===== USER CONFIG =====
    
    async def get_user_config(self, user_id: str) -> Optional[dict]:
        """Get user configuration"""
        data = await self._request(
            'GET',
            f'user_config?user_id=eq.{user_id}&select=*'
        )
        return data[0] if data else None


class AIHandler:
    """Handles AI responses using OpenRouter"""
    
    def __init__(self, api_key: str, model: str = 'google/gemini-2.0-flash-001'):
        self.api_key = api_key
        self.model = model
        self.base_url = 'https://openrouter.ai/api/v1/chat/completions'
    
    async def generate_response(
        self,
        prompt: str,
        conversation_history: List[dict],
        incoming_message: str,
        history_limit: int = 10
    ) -> Optional[str]:
        """Generate AI response based on conversation history"""
        if not self.api_key:
            logger.warning("No OpenRouter API key configured")
            return None
        
        messages = [{"role": "system", "content": prompt}]
        
        # Add conversation history
        for msg in conversation_history[-max(1, history_limit):]:
            role = 'assistant' if msg['sender'] == 'me' else 'user'
            messages.append({"role": role, "content": msg['content']})
        
        # Add incoming message
        messages.append({"role": "user", "content": incoming_message})
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'model': self.model,
                        'messages': messages,
                        'max_tokens': 500,
                        'temperature': 0.7
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data['choices'][0]['message']['content']
                else:
                    logger.error(f"OpenRouter error: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"AI generation error: {e}")
            return None


class TelegramHandler:
    """Handles Telegram operations using Telethon"""
    
    def __init__(self):
        self.clients: Dict[str, TelegramClient] = {}
        self.proxy_health_cache: Dict[str, Dict[str, Any]] = {}
        self.last_errors: Dict[str, str] = {}

    def _set_error(self, account_id: str, message: str):
        self.last_errors[account_id] = message

    def _deep_check_proxy_sync(self, proxy_url: str) -> tuple[bool, str]:
        """Attempt a real connection through proxy to Telegram."""
        parsed = urlparse(proxy_url)
        host = parsed.hostname
        port = parsed.port
        scheme = (parsed.scheme or '').lower()
        user = parsed.username
        password = parsed.password

        if not host or not port:
            return False, "Invalid proxy URL"

        if not SOCKS_LIB_AVAILABLE:
            return False, "Proxy library not available"

        if scheme in ('socks5', 'socks5h'):
            proxy_type = socks.SOCKS5
        elif scheme == 'socks4':
            proxy_type = socks.SOCKS4
        elif scheme in ('http', 'https'):
            proxy_type = socks.HTTP
        else:
            return False, f"Unsupported proxy scheme: {scheme}"

        last_error = None
        for attempt in range(2):
            sock = socks.socksocket()
            sock.settimeout(8)
            try:
                sock.set_proxy(proxy_type, host, port, True, user, password)
                sock.connect(("api.telegram.org", 443))
                sock.close()
                return True, ""
            except Exception as e:
                last_error = e
                try:
                    sock.close()
                except Exception:
                    pass
                if attempt == 0:
                    continue
        return False, f"Proxy connect failed: {last_error}"

    async def _check_proxy(self, proxy_url: str, account_id: str) -> bool:
        """Deep proxy check (real connection through proxy)."""
        cache = self.proxy_health_cache.get(proxy_url)
        if cache:
            checked_at = cache.get('checked_at')
            if checked_at and (datetime.utcnow() - checked_at).total_seconds() < 600:
                ok = cache.get('ok', False)
                if not ok:
                    self._set_error(account_id, cache.get('error', 'Proxy check failed'))
                return ok

        ok = False
        error_message = "Proxy check failed"

        if SOCKS_LIB_AVAILABLE:
            ok, error_message = await asyncio.to_thread(self._deep_check_proxy_sync, proxy_url)
        else:
            parsed = urlparse(proxy_url)
            host = parsed.hostname
            port = parsed.port
            if host and port:
                try:
                    reader, writer = await asyncio.wait_for(
                        asyncio.open_connection(host, port),
                        timeout=5
                    )
                    writer.close()
                    if hasattr(writer, 'wait_closed'):
                        await writer.wait_closed()
                    ok = True
                except Exception as e:
                    error_message = f"Proxy check failed: {e}"
            else:
                error_message = "Invalid proxy URL"

        self.proxy_health_cache[proxy_url] = {
            'ok': ok,
            'checked_at': datetime.utcnow(),
            'error': error_message
        }
        if not ok:
            logger.warning(f"Proxy check failed for {proxy_url}: {error_message}")
            self._set_error(account_id, error_message)
        return ok
    
    async def get_client(self, account: dict) -> Optional[TelegramClient]:
        """Get or create Telegram client for account"""
        account_id = str(account['id'])

        self.last_errors.pop(account_id, None)
        
        if account_id in self.clients:
            client = self.clients[account_id]
            cached_proxy = getattr(client, '_outreach_proxy_url', None)
            current_proxy = account.get('proxy_url')
            if cached_proxy != current_proxy:
                try:
                    if client.is_connected():
                        await client.disconnect()
                except Exception:
                    pass
                del self.clients[account_id]
            else:
                if client.is_connected():
                    return client
                # Reconnect if disconnected
                try:
                    await client.connect()
                    return client
                except Exception:
                    del self.clients[account_id]
        
        # Create new client
        session_string = account.get('session_string')
        session_file_data = account.get('session_file_data')
        session = None

        if session_string:
            session = StringSession(session_string)
        elif session_file_data:
            try:
                session_bytes = base64.b64decode(session_file_data)
            except Exception as e:
                logger.error(f"Invalid session_file_data for {account['phone_number']}: {e}")
                self._set_error(account_id, "Invalid session file data")
                return None

            session_path = os.path.join(
                tempfile.gettempdir(),
                f"outreach_{account_id}.session"
            )
            try:
                with open(session_path, 'wb') as f:
                    f.write(session_bytes)
                session = session_path
            except Exception as e:
                logger.error(f"Failed to write session file for {account['phone_number']}: {e}")
                self._set_error(account_id, "Failed to write session file")
                return None
        else:
            logger.error(f"No session data for account {account['phone_number']}")
            self._set_error(account_id, "Missing session data")
            return None
        
        api_id = int(account.get('api_id', 0))
        api_hash = account.get('api_hash', '')
        
        if not api_id or not api_hash:
            # Use default Telegram API credentials (public)
            api_id = 2040
            api_hash = 'b18441a1ff607e10a989891a5462e627'
        
        # Parse proxy if provided
        proxy = None
        proxy_url = account.get('proxy_url')
        if proxy_url:
            if not await self._check_proxy(proxy_url, account_id):
                self._set_error(account_id, "Proxy check failed")
                return None
            proxy = self._parse_proxy(proxy_url)
            if proxy is None:
                self._set_error(account_id, "Invalid proxy configuration")
                return None

        for attempt in range(2):
            try:
                client = TelegramClient(
                    session,
                    api_id,
                    api_hash,
                    proxy=proxy
                )
                
                await client.connect()
                
                if not await client.is_user_authorized():
                    logger.error(f"Account {account['phone_number']} not authorized")
                    self._set_error(account_id, "Account not authorized")
                    return None
                
                setattr(client, '_outreach_proxy_url', proxy_url)
                self.clients[account_id] = client
                logger.info(f"âœ… Connected account: {account['phone_number']}")
                return client
                
            except AuthKeyUnregisteredError:
                logger.error(f"Session expired for {account['phone_number']}")
                self._set_error(account_id, "Session expired")
                return None
            except Exception as e:
                if attempt == 0:
                    logger.warning(f"Connect failed for {account['phone_number']}, retrying: {e}")
                    await asyncio.sleep(2)
                    continue
                logger.error(f"Error connecting account {account['phone_number']}: {e}")
                self._set_error(account_id, f"Connection failed: {e}")
                return None
    
    def _parse_proxy(self, proxy_url: str) -> tuple:
        """Parse proxy URL to Telethon format"""
        try:
            # Format: socks5://user:pass@host:port or http://user:pass@host:port
            import re
            match = re.match(r'(socks[45]|http)://(?:([^:]+):([^@]+)@)?([^:]+):(\d+)', proxy_url)
            if match:
                proto, user, passwd, host, port = match.groups()
                proxy_type = 2 if 'socks5' in proto else 1  # 2=SOCKS5, 1=SOCKS4
                if 'http' in proto:
                    return ('http', host, int(port), True, user, passwd)
                return (proxy_type, host, int(port), True, user, passwd)
        except Exception as e:
            logger.error(f"Error parsing proxy: {e}")
        return None
    
    async def send_message(self, client: TelegramClient, username: str, message: str) -> tuple:
        """Send message to user. Returns (success, error_message, user_info)"""
        try:
            # Resolve username
            entity = await client.get_entity(username)
            
            if not isinstance(entity, User):
                return False, "Not a user", None
            
            # Send message
            await client.send_message(entity, message)
            
            user_info = {
                'id': entity.id,
                'first_name': entity.first_name,
                'last_name': entity.last_name,
                'username': entity.username
            }
            
            return True, None, user_info
            
        except FloodWaitError as e:
            return False, f"FloodWait: {e.seconds}s", None
        except PeerFloodError:
            return False, "PeerFlood - account limited", None
        except UserPrivacyRestrictedError:
            return False, "User privacy restricted", None
        except UserNotMutualContactError:
            return False, "User not mutual contact", None
        except ChatWriteForbiddenError:
            return False, "Cannot write to user", None
        except Exception as e:
            return False, str(e), None

    async def send_message_any(self, client: TelegramClient, target: str, message: str) -> tuple:
        """Send message to any entity (user/group/channel). Returns (success, error_message)."""
        try:
            entity = await client.get_entity(target)
            await client.send_message(entity, message)
            return True, None
        except FloodWaitError as e:
            return False, f"FloodWait: {e.seconds}s"
        except PeerFloodError:
            return False, "PeerFlood - account limited"
        except ChatWriteForbiddenError:
            return False, "Cannot write to target"
        except Exception as e:
            return False, str(e)

    async def forward_recent_messages(
        self,
        client: TelegramClient,
        source: str,
        target: str,
        limit: int
    ) -> tuple:
        """Forward last N messages from source chat to target chat."""
        try:
            source_entity = await client.get_entity(source)
            target_entity = await client.get_entity(target)
            messages = await client.get_messages(source_entity, limit=limit)
            messages = list(reversed(messages))
            forwarded = 0
            last_error = None
            for msg in messages:
                try:
                    await client.forward_messages(target_entity, msg)
                    forwarded += 1
                except Exception as e:
                    last_error = e
            if forwarded > 0:
                return True, None
            return False, str(last_error) if last_error else "No messages to forward"
        except Exception as e:
            return False, str(e)
    
    async def get_new_messages(self, client: TelegramClient, username: str, last_msg_count: int = 0) -> List[dict]:
        """Get new incoming messages from a user"""
        try:
            entity = await client.get_entity(username)
            messages = []
            
            # Get recent messages
            async for msg in client.iter_messages(entity, limit=20):
                if msg.out:  # Skip our messages
                    continue
                if not msg.text:
                    continue
                messages.append({
                    'id': msg.id,
                    'text': msg.text,
                    'date': msg.date.isoformat()
                })
            
            return messages[::-1]  # Reverse to chronological order
            
        except Exception as e:
            logger.error(f"Error getting messages from {username}: {e}")
            return []
    
    async def mark_as_read(self, client: TelegramClient, username: str):
        """Mark messages as read"""
        try:
            entity = await client.get_entity(username)
            await client.send_read_acknowledge(entity)
        except Exception as e:
            logger.error(f"Error marking as read: {e}")
    
    async def close_all(self):
        """Close all clients"""
        for client in self.clients.values():
            try:
                await client.disconnect()
            except:
                pass
        self.clients.clear()


class OutreachWorker:
    """Main outreach worker"""
    
    def __init__(self):
        self.supabase: Optional[OutreachSupabaseClient] = None
        self.telegram: Optional[TelegramHandler] = None
        self.running = False
        self.daily_sent: Dict[str, int] = {}  # account_id -> count
        self.last_reset = datetime.utcnow().date()
        self.last_account_id: Optional[str] = None

    def _get_campaign_safety(self, campaign: dict) -> dict:
        message_delay_min, message_delay_max = _normalize_range(
            campaign.get('message_delay_min', 60),
            campaign.get('message_delay_max', 180),
            60,
            180
        )
        pre_read_delay_min, pre_read_delay_max = _normalize_range(
            campaign.get('pre_read_delay_min', 5),
            campaign.get('pre_read_delay_max', 10),
            5,
            10
        )
        read_reply_delay_min, read_reply_delay_max = _normalize_range(
            campaign.get('read_reply_delay_min', 5),
            campaign.get('read_reply_delay_max', 10),
            5,
            10
        )
        account_loop_delay_min, account_loop_delay_max = _normalize_range(
            campaign.get('account_loop_delay_min', 300),
            campaign.get('account_loop_delay_max', 600),
            300,
            600
        )
        dialog_wait_window_min, dialog_wait_window_max = _normalize_range(
            campaign.get('dialog_wait_window_min', 40),
            campaign.get('dialog_wait_window_max', 60),
            40,
            60
        )

        return {
            'daily_limit': int(campaign.get('daily_limit', 20) or 20),
            'message_delay_min': message_delay_min,
            'message_delay_max': message_delay_max,
            'pre_read_delay_min': pre_read_delay_min,
            'pre_read_delay_max': pre_read_delay_max,
            'read_reply_delay_min': read_reply_delay_min,
            'read_reply_delay_max': read_reply_delay_max,
            'account_loop_delay_min': account_loop_delay_min,
            'account_loop_delay_max': account_loop_delay_max,
            'dialog_wait_window_min': dialog_wait_window_min,
            'dialog_wait_window_max': dialog_wait_window_max,
            'sleep_periods': _parse_sleep_periods(campaign.get('sleep_periods')),
            'timezone_offset': int(campaign.get('timezone_offset', 3) or 3),
            'ignore_bot_usernames': campaign.get('ignore_bot_usernames', True),
            'account_cooldown_hours': int(campaign.get('account_cooldown_hours', 5) or 5),
            'follow_up_enabled': campaign.get('follow_up_enabled', False),
            'follow_up_delay_hours': int(campaign.get('follow_up_delay_hours', 24) or 24),
            'follow_up_prompt': campaign.get('follow_up_prompt'),
            'reply_only_if_previously_wrote': campaign.get('reply_only_if_previously_wrote', True)
        }

    def _get_lead_settings(self, campaign: dict) -> dict:
        def _text(value: Any) -> str:
            if value is None:
                return ''
            return str(value).strip()

        def _positive_int(value: Any, fallback: int) -> int:
            try:
                parsed = int(value)
            except Exception:
                parsed = fallback
            return parsed if parsed > 0 else fallback

        return {
            'trigger_phrase_positive': _text(campaign.get('trigger_phrase_positive')),
            'trigger_phrase_negative': _text(campaign.get('trigger_phrase_negative')),
            'target_chat_positive': _text(campaign.get('target_chat_positive')),
            'target_chat_negative': _text(campaign.get('target_chat_negative')),
            'forward_limit': _positive_int(campaign.get('forward_limit'), DEFAULT_FORWARD_LIMIT),
            'history_limit': _positive_int(campaign.get('history_limit'), DEFAULT_HISTORY_LIMIT),
            'use_fallback_on_ai_fail': bool(campaign.get('use_fallback_on_ai_fail')),
            'fallback_text': _text(campaign.get('fallback_text'))
        }

    def _render_ai_prompt(self, prompt: str, lead_settings: dict) -> str:
        if not prompt:
            return prompt

        text = prompt
        pos_phrase = lead_settings.get('trigger_phrase_positive') or ''
        neg_phrase = lead_settings.get('trigger_phrase_negative') or ''

        if '{trigger_phrase_positive}' in text and not pos_phrase:
            pos_phrase = DEFAULT_TRIGGER_PHRASE_POSITIVE
            lead_settings['trigger_phrase_positive'] = pos_phrase
        if '{trigger_phrase_negative}' in text and not neg_phrase:
            neg_phrase = DEFAULT_TRIGGER_PHRASE_NEGATIVE
            lead_settings['trigger_phrase_negative'] = neg_phrase

        if pos_phrase:
            text = text.replace('{trigger_phrase_positive}', pos_phrase)
        if neg_phrase:
            text = text.replace('{trigger_phrase_negative}', neg_phrase)

        lower_text = text.lower()
        instructions = []
        if pos_phrase and pos_phrase.lower() not in lower_text:
            instructions.append(f'Если есть интерес, заверши фразой "{pos_phrase}".')
        if neg_phrase and neg_phrase.lower() not in lower_text:
            instructions.append(f'Если нет интереса, заверши фразой "{neg_phrase}".')
        if instructions:
            text = f"{text.rstrip()}\n\n" + " ".join(instructions)

        return text

    def _detect_lead_status(self, response: str, lead_settings: dict) -> Optional[str]:
        if not response:
            return None
        response_lower = response.lower()
        pos_phrase = (lead_settings.get('trigger_phrase_positive') or '').lower()
        neg_phrase = (lead_settings.get('trigger_phrase_negative') or '').lower()
        if pos_phrase and pos_phrase in response_lower:
            return 'lead'
        if neg_phrase and neg_phrase in response_lower:
            return 'not_lead'
        return None

    def _format_forward_summary(self, history: List[dict], limit: int, who: str) -> str:
        if not history:
            return f"Диалог с {who}: история пуста."
        trimmed = history[-limit:] if limit > 0 else history
        lines = [f"Диалог с {who} (последние {len(trimmed)}):"]
        for msg in trimmed:
            sender = msg.get('sender')
            role = "Мы" if sender == 'me' else "Он"
            content = (msg.get('content') or '').strip()
            if len(content) > 800:
                content = content[:800] + "…"
            if content:
                lines.append(f"{role}: {content}")
        return "\n".join(lines)

    async def _handle_lead_detection(
        self,
        campaign: dict,
        chat: dict,
        account: dict,
        client: TelegramClient,
        response: str,
        history: List[dict],
        lead_settings: dict,
        user_id: str
    ) -> Optional[str]:
        lead_status = self._detect_lead_status(response, lead_settings)
        if not lead_status:
            return None

        existing_status = (chat.get('lead_status') or '').lower()
        if existing_status and existing_status != 'none':
            return existing_status

        campaign_name = campaign.get('name') or 'кампания'
        target_username = chat.get('target_username') or ''
        who = f"@{target_username}" if target_username else "пользователь"

        if lead_status == 'lead':
            target_chat = lead_settings.get('target_chat_positive')
            note = f"✅ Пользователь {who} заинтересован в \"{campaign_name}\""
        else:
            target_chat = lead_settings.get('target_chat_negative')
            note = f"❌ Пользователь {who} отказался в \"{campaign_name}\""

        if target_chat:
            success, error = await self.telegram.send_message_any(client, target_chat, note)
            if not success:
                await self.supabase.log(
                    user_id,
                    'WARNING',
                    f"Lead notify failed to {target_chat}: {error}",
                    str(campaign['id']),
                    str(account['id'])
                )
            source_handle = target_username
            if source_handle and not source_handle.startswith('@') and not source_handle.startswith('+'):
                source_handle = f"@{source_handle}"
            forward_limit = lead_settings.get('forward_limit', DEFAULT_FORWARD_LIMIT)
            if source_handle:
                success, error = await self.telegram.forward_recent_messages(
                    client,
                    source_handle,
                    target_chat,
                    forward_limit
                )
                if not success:
                    summary = self._format_forward_summary(history, forward_limit, who)
                    await self.telegram.send_message_any(client, target_chat, summary)
            else:
                await self.supabase.log(
                    user_id,
                    'WARNING',
                    "Lead detected but source chat is missing",
                    str(campaign['id']),
                    str(account['id'])
                )
        else:
            await self.supabase.log(
                user_id,
                'WARNING',
                "Lead detected but target chat is not configured",
                str(campaign['id']),
                str(account['id'])
            )

        now_iso = datetime.utcnow().isoformat()
        await self.supabase.update_chat(str(chat['id']), {
            'lead_status': lead_status,
            'processed_at': now_iso,
            'status': 'manual'
        })
        if target_username:
            await self.supabase.update_target_by_username(
                str(campaign['id']),
                target_username,
                {'lead_status': lead_status}
            )
            await self.supabase.add_processed_client(
                user_id,
                str(campaign['id']),
                _normalize_username(target_username),
                chat.get('target_name')
            )

        await self.supabase.log(
            user_id,
            'SUCCESS',
            f"Lead detected: {lead_status} for {who}",
            str(campaign['id']),
            str(account['id'])
        )

        chat['lead_status'] = lead_status
        chat['processed_at'] = now_iso
        chat['status'] = 'manual'
        return lead_status

    def _is_account_in_cooldown(self, account: dict) -> bool:
        cooldown_until = _safe_iso_datetime(account.get('cooldown_until'))
        if cooldown_until and cooldown_until > datetime.utcnow().replace(tzinfo=cooldown_until.tzinfo):
            return True
        return False

    def _get_messages_sent_today(self, account: dict) -> int:
        today = datetime.utcnow().date()
        last_sent_date = _safe_iso_date(account.get('last_sent_date'))
        if last_sent_date and last_sent_date != today:
            return 0
        return int(account.get('messages_sent_today') or 0)
    
    async def start(self):
        """Start the worker"""
        logger.info("=" * 60)
        logger.info("ðŸš€ Outreach Worker Starting")
        logger.info("=" * 60)
        
        if not TELETHON_AVAILABLE:
            logger.error("âŒ Telethon not available - cannot start")
            return
        
        try:
            # Initialize
            self.supabase = OutreachSupabaseClient(SUPABASE_URL, SUPABASE_KEY)
            await self.supabase.connect()
            
            self.telegram = TelegramHandler()
            
            self.running = True
            await self.main_loop()
            
        except KeyboardInterrupt:
            logger.warning("âš ï¸ Received interrupt")
        except Exception as e:
            logger.critical(f"âŒ Fatal error: {e}", exc_info=True)
        finally:
            await self.shutdown()
    
    async def main_loop(self):
        """Main processing loop"""
        iteration = 0
        
        while self.running:
            iteration += 1
            logger.info(f"ðŸ”„ Iteration #{iteration}")
            
            try:
                # Process pending manual messages
                if self.supabase and self.telegram:
                    await self._process_manual_messages()

                # Reset daily counters if new day
                self._check_daily_reset()
                
                # Reactivate accounts whose cooldown expired
                if self.supabase:
                    reactivated = await self.supabase.reactivate_expired_cooldowns()
                    if reactivated:
                        logger.info(f"✅ Reactivated {reactivated} account(s) after cooldown")
                
                # Get active campaigns
                campaigns = await self.supabase.get_active_outreach_campaigns()
                
                if not campaigns:
                    logger.info("â„¹ï¸ No active outreach campaigns")
                else:
                    logger.info(f"ðŸ“‹ Processing {len(campaigns)} active campaign(s)")
                    
                    for campaign in campaigns:
                        await self.process_campaign(campaign)
                
            except Exception as e:
                logger.error(f"âŒ Error in main loop: {e}", exc_info=True)
            
            # Wait before next iteration
            await asyncio.sleep(30)
    
    def _check_daily_reset(self):
        """Reset daily counters if new day"""
        today = datetime.utcnow().date()
        if today > self.last_reset:
            logger.info("ðŸ”„ Resetting daily counters")
            self.daily_sent.clear()
            self.last_reset = today
            if self.supabase:
                try:
                    asyncio.create_task(self.supabase.reset_daily_counters(today))
                except Exception:
                    pass

    async def _process_manual_messages(self):
        """Send pending manual messages from UI"""
        messages = await self.supabase.get_pending_manual_messages(limit=20)
        if not messages:
            return

        logger.info(f"ðŸ“¬ Processing {len(messages)} manual message(s)")
        for msg in messages:
            msg_id = str(msg.get('id'))
            chat_id = msg.get('chat_id')
            account_id = msg.get('account_id')
            target_username = msg.get('target_username')
            content = msg.get('content') or ''

            await self.supabase.update_manual_message(msg_id, {
                'status': 'processing',
                'updated_at': datetime.utcnow().isoformat()
            })

            if not chat_id or not account_id or not target_username:
                await self.supabase.update_manual_message(msg_id, {
                    'status': 'failed',
                    'error_message': 'Missing chat/account/username',
                    'updated_at': datetime.utcnow().isoformat()
                })
                continue

            account = await self.supabase.get_outreach_account_by_id(str(account_id))
            if not account:
                await self.supabase.update_manual_message(msg_id, {
                    'status': 'failed',
                    'error_message': 'Account not found',
                    'updated_at': datetime.utcnow().isoformat()
                })
                continue

            client = await self.telegram.get_client(account)
            if not client:
                error_message = self.telegram.last_errors.get(str(account_id), 'Connection failed')
                await self.supabase.update_manual_message(msg_id, {
                    'status': 'failed',
                    'error_message': error_message,
                    'updated_at': datetime.utcnow().isoformat()
                })
                continue

            handle = target_username
            if not handle.startswith('@') and not handle.startswith('+'):
                handle = f"@{handle}"

            success, error, _ = await self.telegram.send_message(client, handle, content)
            if success:
                await self.supabase.add_message(str(chat_id), 'me', content)
                await self.supabase.update_chat(str(chat_id), {'status': 'manual'})

                messages_today = self._get_messages_sent_today(account)
                today_str = datetime.utcnow().date().isoformat()
                await self.supabase.update_account_fields(str(account_id), {
                    'messages_sent_today': messages_today + 1,
                    'last_sent_date': today_str,
                    'last_used_at': datetime.utcnow().isoformat()
                })
                account['messages_sent_today'] = messages_today + 1
                account['last_sent_date'] = today_str
                account['last_used_at'] = datetime.utcnow().isoformat()

                await self.supabase.update_manual_message(msg_id, {
                    'status': 'sent',
                    'error_message': None,
                    'updated_at': datetime.utcnow().isoformat()
                })
            else:
                await self.supabase.update_manual_message(msg_id, {
                    'status': 'failed',
                    'error_message': error or 'Send failed',
                    'updated_at': datetime.utcnow().isoformat()
                })
    
    async def process_campaign(self, campaign: dict):
        """Process a single campaign"""
        campaign_id = str(campaign['id'])
        user_id = str(campaign['user_id'])
        campaign_name = campaign['name']
        
        logger.info(f"ðŸ“‹ Processing campaign: {campaign_name}")
        
        try:
            # Get user config for API key
            user_config = await self.supabase.get_user_config(user_id)
            openrouter_key = user_config.get('openrouter_api_key') if user_config else None
            
            # Get accounts for this campaign
            account_ids = campaign.get('account_ids', [])
            if not account_ids:
                logger.warning(f"âš ï¸ Campaign {campaign_name} has no accounts")
                return
            
            accounts = await self.supabase.get_outreach_accounts(account_ids)
            if not accounts:
                logger.warning(f"âš ï¸ No active accounts for campaign {campaign_name}")
                return
            
            processed_records = await self.supabase.get_processed_clients(campaign_id)
            processed_usernames = {
                _normalize_username(item.get('target_username'))
                for item in processed_records
                if item.get('target_username')
            }

            # Phase 1: Send initial messages to pending targets
            await self._send_initial_messages(campaign, accounts, user_id, processed_usernames)
            
            # Phase 2: Check for new replies and process them
            await self._check_for_replies(campaign, accounts, user_id, openrouter_key, processed_usernames)
            
            # Update campaign stats
            await self.supabase.update_campaign(campaign_id, {
                'last_activity_at': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            logger.error(f"âŒ Error processing campaign {campaign_name}: {e}")
            await self.supabase.log(user_id, 'ERROR', f"Campaign error: {e}", campaign_id)
    
    async def _send_initial_messages(
        self,
        campaign: dict,
        accounts: List[dict],
        user_id: str,
        processed_usernames: set[str]
    ):
        """Send initial messages to pending targets"""
        campaign_id = str(campaign['id'])
        message_template = campaign.get('message_template', '')
        safety = self._get_campaign_safety(campaign)
        daily_limit = safety['daily_limit']
        delay_min = safety['message_delay_min']
        delay_max = safety['message_delay_max']
        account_loop_delay_min = safety['account_loop_delay_min']
        account_loop_delay_max = safety['account_loop_delay_max']
        sleep_periods = safety['sleep_periods']
        timezone_offset = safety['timezone_offset']

        if _is_sleep_time(sleep_periods, timezone_offset):
            logger.info("💤 Campaign in sleep period, skipping initial messages")
            return
        
        # Get pending targets
        targets = await self.supabase.get_pending_targets(campaign_id, limit=20)
        
        if not targets:
            logger.debug(f"No pending targets for campaign {campaign['name']}")
            return
        
        logger.info(f"ðŸŽ¯ Found {len(targets)} pending targets")
        
        # Round-robin through accounts
        account_index = 0
        last_account_id = None
        
        for target in targets:
            target_id = str(target['id'])
            username = target.get('username')
            phone = target.get('phone')
            identifier = username or phone
            
            if not identifier:
                await self.supabase.update_target(target_id, {
                    'status': 'failed',
                    'error_message': 'No username or phone'
                })
                continue

            if username and safety.get('ignore_bot_usernames', True):
                uname = username.lower().lstrip('@')
                if uname.endswith('bot') or uname.startswith(BOT_USERNAME_PREFIXES):
                    await self.supabase.update_target(target_id, {
                        'status': 'failed',
                        'error_message': 'Bot username'
                    })
                    continue

            if username:
                normalized = _normalize_username(username)
                if normalized and normalized in processed_usernames:
                    await self.supabase.update_target(target_id, {
                        'status': 'failed',
                        'error_message': 'Processed client'
                    })
                    continue
            
            # Find available account
            account = None
            for _ in range(len(accounts)):
                acc = accounts[account_index % len(accounts)]
                acc_id = str(acc['id'])

                # Check cooldown
                if self._is_account_in_cooldown(acc):
                    account_index += 1
                    continue

                # Check daily limit
                messages_today = self._get_messages_sent_today(acc)
                if messages_today < daily_limit:
                    account = acc
                    break
                
                account_index += 1
            
            if not account:
                logger.warning("âš ï¸ All accounts reached daily limit")
                break
            
            account_id = str(account['id'])
            messages_today = self._get_messages_sent_today(account)
            
            # Get Telegram client
            client = await self.telegram.get_client(account)
            if not client:
                error_message = self.telegram.last_errors.get(account_id, 'Connection failed')
                cooldown_seconds = safety['account_cooldown_hours'] * 3600
                cooldown_until = (datetime.utcnow() + timedelta(seconds=cooldown_seconds)).isoformat()
                await self.supabase.update_account_fields(account_id, {
                    'status': 'paused',
                    'error_message': error_message,
                    'cooldown_until': cooldown_until
                })
                account_index += 1
                continue
            
            # Send message
            logger.info(f"ðŸ“¤ Sending to @{identifier} via {account['phone_number']}")
            
            # Ensure username format
            target_handle = identifier
            if not target_handle.startswith('@') and not target_handle.startswith('+'):
                target_handle = f"@{target_handle}"

            # Delay between accounts (human-like rotation)
            if last_account_id and last_account_id != account_id:
                rotation_delay = random.randint(account_loop_delay_min, account_loop_delay_max)
                logger.debug(f"⏳ Waiting {rotation_delay}s before switching accounts")
                await asyncio.sleep(rotation_delay)
            
            success, error, user_info = await self.telegram.send_message(
                client, 
                target_handle,
                message_template
            )
            
            if success:
                # Update target
                await self.supabase.update_target(target_id, {
                    'status': 'sent',
                    'sent_at': datetime.utcnow().isoformat(),
                    'assigned_account_id': account_id,
                    'telegram_user_id': user_info.get('id') if user_info else None
                })
                
                # Create chat record
                clean_username = identifier.replace('@', '')
                chat = await self.supabase.get_or_create_chat(
                    user_id,
                    account_id,
                    campaign_id,
                    clean_username,
                    f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() if user_info else None
                )
                
                if chat:
                    await self.supabase.add_message(str(chat['id']), 'me', message_template)
                
                # Update counters
                self.daily_sent[account_id] = self.daily_sent.get(account_id, 0) + 1
                today_str = datetime.utcnow().date().isoformat()
                await self.supabase.update_account_fields(account_id, {
                    'messages_sent_today': messages_today + 1,
                    'last_sent_date': today_str,
                    'last_used_at': datetime.utcnow().isoformat()
                })
                account['messages_sent_today'] = messages_today + 1
                account['last_sent_date'] = today_str
                account['last_used_at'] = datetime.utcnow().isoformat()
                
                # Increment campaign messages_sent
                await self.supabase.increment_campaign_sent(campaign_id)
                
                # Log success
                await self.supabase.log(
                    user_id, 'SUCCESS', 
                    f"Sent to @{identifier}",
                    campaign_id, account_id
                )
                
                logger.info(f"âœ… Sent to @{identifier}")
                
                # Wait before next message
                delay = random.randint(delay_min, delay_max)
                logger.debug(f"â³ Waiting {delay}s before next message")
                await asyncio.sleep(delay)
                
            else:
                # Update target with error
                status = 'failed'
                if 'privacy' in error.lower() or 'mutual' in error.lower():
                    status = 'failed'  # Can't contact this user
                
                await self.supabase.update_target(target_id, {
                    'status': status,
                    'error_message': error,
                    'assigned_account_id': account_id
                })
                
                # Check if account is limited
                if 'flood' in error.lower():
                    cooldown_seconds = safety['account_cooldown_hours'] * 3600
                    if 'floodwait' in error.lower():
                        try:
                            cooldown_seconds = int(error.split(':')[-1].strip().replace('s', ''))
                        except Exception:
                            cooldown_seconds = safety['account_cooldown_hours'] * 3600
                    cooldown_until = (datetime.utcnow() + timedelta(seconds=cooldown_seconds)).isoformat()
                    await self.supabase.update_account_fields(account_id, {
                        'status': 'paused',
                        'error_message': error,
                        'cooldown_until': cooldown_until
                    })
                    logger.warning(f"âš ï¸ Account {account['phone_number']} rate limited")
                
                await self.supabase.log(
                    user_id, 'WARNING',
                    f"Failed to send to @{identifier}: {error}",
                    campaign_id, account_id
                )
                
                logger.warning(f"âš ï¸ Failed to send to @{identifier}: {error}")
            
            account_index += 1
            last_account_id = account_id

    async def _maybe_send_follow_up(
        self,
        chat: dict,
        account: dict,
        client: TelegramClient,
        follow_up_ai: Optional['AIHandler'],
        safety: dict,
        history_limit: int,
        user_id: str,
        campaign_id: str
    ):
        if not follow_up_ai or not safety.get('follow_up_enabled'):
            return
        lead_status = (chat.get('lead_status') or '').lower()
        if lead_status and lead_status != 'none':
            return
        if chat.get('processed_at'):
            return
        if chat.get('follow_up_sent_at'):
            return
        if chat.get('last_message_sender') != 'me':
            return

        last_message_at = _safe_iso_datetime(chat.get('last_message_at'))
        if not last_message_at:
            return

        delay_hours = safety.get('follow_up_delay_hours', 24)
        if datetime.utcnow() - last_message_at < timedelta(hours=delay_hours):
            return

        messages_today = self._get_messages_sent_today(account)
        if messages_today >= safety.get('daily_limit', 20):
            return

        history = await self.supabase.get_chat_messages(str(chat['id']), limit=history_limit)
        if safety.get('reply_only_if_previously_wrote', True):
            if not any(msg.get('sender') == 'me' for msg in history):
                return

        follow_up_prompt = safety.get('follow_up_prompt') or (
            "Напиши короткое напоминание о себе. Вежливо напомни о предложении и спроси, актуально ли оно еще. "
            "Если не актуально - попроси сообщить об этом. Сообщение должно быть кратким (2-3 предложения)."
        )
        response = await follow_up_ai.generate_response(
            follow_up_prompt,
            history,
            "Напиши follow-up сообщение.",
            history_limit
        )
        if not response:
            return

        target_username = chat.get('target_username')
        if not target_username:
            return

        success, error, _ = await self.telegram.send_message(
            client, f"@{target_username}", response
        )
        if not success:
            logger.error(f"Failed to send follow-up to @{target_username}: {error}")
            return

        await self.supabase.add_message(str(chat['id']), 'me', response)
        await self.supabase.mark_follow_up_sent(str(chat['id']))
        await self.supabase.increment_campaign_sent(campaign_id)

        today_str = datetime.utcnow().date().isoformat()
        await self.supabase.update_account_fields(str(account['id']), {
            'messages_sent_today': messages_today + 1,
            'last_sent_date': today_str,
            'last_used_at': datetime.utcnow().isoformat()
        })
        account['messages_sent_today'] = messages_today + 1
        account['last_sent_date'] = today_str
        account['last_used_at'] = datetime.utcnow().isoformat()

        await self.supabase.log(
            user_id, 'SUCCESS',
            f"Follow-up sent to @{target_username}",
            campaign_id, str(account['id'])
        )
    
    async def _check_for_replies(
        self,
        campaign: dict,
        accounts: List[dict],
        user_id: str,
        openrouter_key: str,
        processed_usernames: set[str]
    ):
        """Check for new replies in all active chats and process them"""
        campaign_id = str(campaign['id'])
        ai_prompt = campaign.get('ai_prompt', '')
        ai_model = campaign.get('ai_model', 'google/gemini-2.0-flash-001')
        auto_reply_enabled = campaign.get('auto_reply_enabled', False)
        safety = self._get_campaign_safety(campaign)
        lead_settings = self._get_lead_settings(campaign)
        history_limit = lead_settings['history_limit']
        rendered_prompt = self._render_ai_prompt(ai_prompt, lead_settings) if ai_prompt else ''
        sleep_periods = safety['sleep_periods']
        timezone_offset = safety['timezone_offset']

        if _is_sleep_time(sleep_periods, timezone_offset):
            logger.info("💤 Campaign in sleep period, skipping reply checks")
            return
        
        # Get all active chats for this campaign
        chats = await self.supabase.get_active_chats_for_campaign(campaign_id)
        
        if not chats:
            return
        
        logger.info(f"ðŸ’¬ Checking {len(chats)} chats for new messages")
        
        # Create AI handler if enabled
        ai = None
        if auto_reply_enabled and openrouter_key and rendered_prompt:
            ai = AIHandler(openrouter_key, ai_model)

        follow_up_ai = None
        follow_up_prompt = safety['follow_up_prompt'] or (
            "Напиши короткое напоминание о себе. Вежливо напомни о предложении и спроси, актуально ли оно еще. "
            "Если не актуально - попроси сообщить об этом. Сообщение должно быть кратким (2-3 предложения)."
        )
        if safety['follow_up_enabled'] and openrouter_key and follow_up_prompt:
            follow_up_ai = AIHandler(openrouter_key, ai_model)
        
        account_loop_delay_min = safety['account_loop_delay_min']
        account_loop_delay_max = safety['account_loop_delay_max']
        pre_read_delay_min = safety['pre_read_delay_min']
        pre_read_delay_max = safety['pre_read_delay_max']
        read_reply_delay_min = safety['read_reply_delay_min']
        read_reply_delay_max = safety['read_reply_delay_max']
        dialog_wait_window_min = safety['dialog_wait_window_min']
        dialog_wait_window_max = safety['dialog_wait_window_max']
        last_reply_account_id = None
        
        for chat in chats:
            chat_id = str(chat['id'])
            account_id = str(chat['account_id'])
            target_username = chat['target_username']
            last_seen_at = chat.get('last_message_at')
            last_seen_dt = None
            if last_seen_at:
                try:
                    last_seen_dt = datetime.fromisoformat(last_seen_at.replace('Z', '+00:00'))
                except Exception:
                    last_seen_dt = None
            
            # Skip if in manual mode
            if chat.get('status') == 'manual':
                continue
            lead_status = (chat.get('lead_status') or '').lower()
            if lead_status and lead_status != 'none':
                continue
            if chat.get('processed_at'):
                continue

            normalized = _normalize_username(target_username)
            if normalized and normalized in processed_usernames:
                continue

            # Skip bot-like usernames if enabled
            if safety.get('ignore_bot_usernames', True):
                uname = (target_username or '').lower()
                if uname.endswith('bot') or uname.startswith(BOT_USERNAME_PREFIXES):
                    logger.info(f"🤖 Skipping bot-like username @{target_username}")
                    continue
            
            # Find account
            account = next((a for a in accounts if str(a['id']) == account_id), None)
            if not account:
                continue
            if self._is_account_in_cooldown(account):
                continue
            
            # Get client
            client = await self.telegram.get_client(account)
            if not client:
                error_message = self.telegram.last_errors.get(account_id, 'Connection failed')
                cooldown_seconds = safety['account_cooldown_hours'] * 3600
                cooldown_until = (datetime.utcnow() + timedelta(seconds=cooldown_seconds)).isoformat()
                await self.supabase.update_account_fields(account_id, {
                    'status': 'paused',
                    'error_message': error_message,
                    'cooldown_until': cooldown_until
                })
                continue

            if last_reply_account_id and last_reply_account_id != account_id:
                rotation_delay = random.randint(account_loop_delay_min, account_loop_delay_max)
                logger.debug(f"⏳ Waiting {rotation_delay}s before switching accounts")
                await asyncio.sleep(rotation_delay)
            
            try:
                # Get messages from Telegram
                messages = await self.telegram.get_new_messages(client, target_username)
                
                if not messages:
                    await self._maybe_send_follow_up(
                        chat,
                        account,
                        client,
                        follow_up_ai,
                        safety,
                        history_limit,
                        user_id,
                        campaign_id
                    )
                    continue
                
                # Filter only new messages since last_message_at
                new_messages = []
                for msg in messages:
                    msg_date_raw = msg.get('date')
                    msg_date = None
                    if msg_date_raw:
                        try:
                            msg_date = datetime.fromisoformat(msg_date_raw.replace('Z', '+00:00'))
                        except Exception:
                            msg_date = None
                    if last_seen_dt and msg_date and msg_date <= last_seen_dt:
                        continue
                    new_messages.append(msg)
                
                if not new_messages:
                    await self._maybe_send_follow_up(
                        chat,
                        account,
                        client,
                        follow_up_ai,
                        safety,
                        history_limit,
                        user_id,
                        campaign_id
                    )
                    continue
                
                logger.info(f"ðŸ“¥ {len(new_messages)} new message(s) from @{target_username}")

                pre_delay = random.randint(pre_read_delay_min, pre_read_delay_max)
                if pre_delay > 0:
                    await asyncio.sleep(pre_delay)
                await self.telegram.mark_as_read(client, target_username)
                
                # Get conversation history for AI
                history = await self.supabase.get_chat_messages(chat_id, limit=history_limit)
                
                # Process each new message
                for msg in new_messages:
                    incoming_text = msg.get('text', '')
                    if not incoming_text:
                        continue
                    
                    # Save incoming message
                    await self.supabase.add_message(chat_id, 'them', incoming_text)
                    
                    # Increment unread count (for UI)
                    await self.supabase.increment_unread(chat_id)
                    history.append({'sender': 'them', 'content': incoming_text})
                    
                    logger.info(f"ðŸ“¥ Message from @{target_username}: {incoming_text[:50]}...")
                    
                    # Generate and send AI response if enabled
                    if ai:
                        should_reply = True
                        if safety.get('reply_only_if_previously_wrote', True):
                            if not any(msg.get('sender') == 'me' for msg in history):
                                logger.info(f"Skipping AI reply for @{target_username}: no previous messages from us")
                                should_reply = False

                        if should_reply:
                            messages_today = self._get_messages_sent_today(account)
                            if messages_today >= safety.get('daily_limit', 20):
                                logger.info(f"Daily limit reached for account {account_id}, skipping AI reply")
                                should_reply = False

                        if should_reply:
                            reply_delay = random.randint(read_reply_delay_min, read_reply_delay_max)
                            if reply_delay > 0:
                                await asyncio.sleep(reply_delay)

                            response = await ai.generate_response(
                                rendered_prompt,
                                history,
                                incoming_text,
                                history_limit
                            )
                            if not response and lead_settings.get('use_fallback_on_ai_fail'):
                                fallback_text = lead_settings.get('fallback_text')
                                if fallback_text:
                                    response = fallback_text
                            
                            if response:
                                # Send response
                                success, error, _ = await self.telegram.send_message(
                                    client, f"@{target_username}", response
                                )
                                
                                if success:
                                    await self.supabase.add_message(chat_id, 'me', response)
                                    today_str = datetime.utcnow().date().isoformat()
                                    await self.supabase.update_account_fields(account_id, {
                                        'messages_sent_today': messages_today + 1,
                                        'last_sent_date': today_str,
                                        'last_used_at': datetime.utcnow().isoformat()
                                    })
                                    account['messages_sent_today'] = messages_today + 1
                                    account['last_sent_date'] = today_str
                                    account['last_used_at'] = datetime.utcnow().isoformat()
                                    
                                    # Increment campaign replied count
                                    await self.supabase.increment_campaign_replied(campaign_id)
                                    
                                    await self.supabase.log(
                                        user_id, 'SUCCESS',
                                        f"AI replied to @{target_username}",
                                        campaign_id, account_id
                                    )
                                    
                                    logger.info(f"ðŸ¤– AI replied to @{target_username}")
                                    
                                    # Add to history for context
                                    history.append({'sender': 'me', 'content': response})
                                    
                                    # Small delay between responses
                                    await asyncio.sleep(random.randint(5, 15))
                                    
                                    # Stay in chat window
                                    dialog_wait = random.randint(dialog_wait_window_min, dialog_wait_window_max)
                                    if dialog_wait > 0:
                                        await asyncio.sleep(dialog_wait)

                                    lead_detected = await self._handle_lead_detection(
                                        campaign,
                                        chat,
                                        account,
                                        client,
                                        response,
                                        history,
                                        lead_settings,
                                        user_id
                                    )
                                    if lead_detected:
                                        break
                                else:
                                    logger.error(f"Failed to send AI reply: {error}")
                    
                    # Update target as replied
                    await self.supabase._request(
                        'PATCH',
                        f'outreach_targets?username=eq.{target_username}&campaign_id=eq.{campaign_id}',
                        json={'status': 'replied'}
                    )
                
                last_reply_account_id = account_id
                
            except Exception as e:
                logger.error(f"Error checking chat {chat_id}: {e}")
    async def shutdown(self):
        """Graceful shutdown"""
        logger.info("ðŸ›‘ Shutting down...")
        
        self.running = False
        
        if self.telegram:
            await self.telegram.close_all()
        
        if self.supabase:
            await self.supabase.close()
        
        logger.info("âœ… Shutdown complete")


def main():
    """Entry point"""
    if sys.version_info < (3, 8):
        print("âŒ Python 3.8+ required")
        sys.exit(1)
    
    worker = OutreachWorker()
    
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        print("\nðŸ‘‹ Goodbye!")
    except Exception as e:
        print(f"âŒ Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

