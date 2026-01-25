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
import httpx
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

from config import LOG_LEVEL, SUPABASE_URL, SUPABASE_KEY, setup_logger

logger = setup_logger('OutreachWorker')

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
            resp = await self.client.request(method, url, headers=self.headers, **kwargs)
            
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
                json={'last_message_at': datetime.utcnow().isoformat()}
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
    
    async def generate_response(self, prompt: str, conversation_history: List[dict], 
                                 incoming_message: str) -> Optional[str]:
        """Generate AI response based on conversation history"""
        if not self.api_key:
            logger.warning("No OpenRouter API key configured")
            return None
        
        messages = [{"role": "system", "content": prompt}]
        
        # Add conversation history
        for msg in conversation_history[-10:]:  # Last 10 messages
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
    
    async def get_client(self, account: dict) -> Optional[TelegramClient]:
        """Get or create Telegram client for account"""
        account_id = str(account['id'])
        
        if account_id in self.clients:
            client = self.clients[account_id]
            if client.is_connected():
                return client
            # Reconnect if disconnected
            try:
                await client.connect()
                return client
            except:
                del self.clients[account_id]
        
        # Create new client
        try:
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
                    return None
            else:
                logger.error(f"No session data for account {account['phone_number']}")
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
                proxy = self._parse_proxy(proxy_url)
            
            client = TelegramClient(
                session,
                api_id,
                api_hash,
                proxy=proxy
            )
            
            await client.connect()
            
            if not await client.is_user_authorized():
                logger.error(f"Account {account['phone_number']} not authorized")
                return None
            
            self.clients[account_id] = client
            logger.info(f"âœ… Connected account: {account['phone_number']}")
            return client
            
        except AuthKeyUnregisteredError:
            logger.error(f"Session expired for {account['phone_number']}")
            return None
        except Exception as e:
            logger.error(f"Error connecting account {account['phone_number']}: {e}")
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
                # Reset daily counters if new day
                self._check_daily_reset()
                
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
            
            # Phase 1: Send initial messages to pending targets
            await self._send_initial_messages(campaign, accounts, user_id)
            
            # Phase 2: Check for new replies and process them
            await self._check_for_replies(campaign, accounts, user_id, openrouter_key)
            
            # Update campaign stats
            await self.supabase.update_campaign(campaign_id, {
                'last_activity_at': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            logger.error(f"âŒ Error processing campaign {campaign_name}: {e}")
            await self.supabase.log(user_id, 'ERROR', f"Campaign error: {e}", campaign_id)
    
    async def _send_initial_messages(self, campaign: dict, accounts: List[dict], user_id: str):
        """Send initial messages to pending targets"""
        campaign_id = str(campaign['id'])
        message_template = campaign.get('message_template', '')
        daily_limit = campaign.get('daily_limit', 20)
        delay_min = campaign.get('message_delay_min', 60)
        delay_max = campaign.get('message_delay_max', 180)
        
        # Get pending targets
        targets = await self.supabase.get_pending_targets(campaign_id, limit=20)
        
        if not targets:
            logger.debug(f"No pending targets for campaign {campaign['name']}")
            return
        
        logger.info(f"ðŸŽ¯ Found {len(targets)} pending targets")
        
        # Round-robin through accounts
        account_index = 0
        
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
            
            # Find available account
            account = None
            for _ in range(len(accounts)):
                acc = accounts[account_index % len(accounts)]
                acc_id = str(acc['id'])
                
                # Check daily limit
                if self.daily_sent.get(acc_id, 0) < daily_limit:
                    account = acc
                    break
                
                account_index += 1
            
            if not account:
                logger.warning("âš ï¸ All accounts reached daily limit")
                break
            
            account_id = str(account['id'])
            
            # Get Telegram client
            client = await self.telegram.get_client(account)
            if not client:
                await self.supabase.update_account_status(account_id, 'error', 'Connection failed')
                account_index += 1
                continue
            
            # Send message
            logger.info(f"ðŸ“¤ Sending to @{identifier} via {account['phone_number']}")
            
            # Ensure username format
            target_handle = identifier
            if not target_handle.startswith('@') and not target_handle.startswith('+'):
                target_handle = f"@{target_handle}"
            
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
                    await self.supabase.update_account_status(account_id, 'paused', error)
                    logger.warning(f"âš ï¸ Account {account['phone_number']} rate limited")
                
                await self.supabase.log(
                    user_id, 'WARNING',
                    f"Failed to send to @{identifier}: {error}",
                    campaign_id, account_id
                )
                
                logger.warning(f"âš ï¸ Failed to send to @{identifier}: {error}")
            
            account_index += 1
    
    async def _check_for_replies(self, campaign: dict, accounts: List[dict], 
                                  user_id: str, openrouter_key: str):
        """Check for new replies in all active chats and process them"""
        campaign_id = str(campaign['id'])
        ai_prompt = campaign.get('ai_prompt', '')
        ai_model = campaign.get('ai_model', 'google/gemini-2.0-flash-001')
        auto_reply_enabled = campaign.get('auto_reply_enabled', False)
        
        # Get all active chats for this campaign
        chats = await self.supabase.get_active_chats_for_campaign(campaign_id)
        
        if not chats:
            return
        
        logger.info(f"ðŸ’¬ Checking {len(chats)} chats for new messages")
        
        # Create AI handler if enabled
        ai = None
        if auto_reply_enabled and openrouter_key and ai_prompt:
            ai = AIHandler(openrouter_key, ai_model)
        
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
            
            # Find account
            account = next((a for a in accounts if str(a['id']) == account_id), None)
            if not account:
                continue
            
            # Get client
            client = await self.telegram.get_client(account)
            if not client:
                continue
            
            try:
                # Get messages from Telegram
                messages = await self.telegram.get_new_messages(client, target_username)
                
                if not messages:
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
                    continue
                
                logger.info(f"ðŸ“¥ {len(new_messages)} new message(s) from @{target_username}")
                
                # Get conversation history for AI
                history = await self.supabase.get_chat_messages(chat_id)
                
                # Process each new message
                for msg in new_messages:
                    incoming_text = msg.get('text', '')
                    if not incoming_text:
                        continue
                    
                    # Save incoming message
                    await self.supabase.add_message(chat_id, 'them', incoming_text)
                    
                    # Increment unread count (for UI)
                    await self.supabase.increment_unread(chat_id)
                    
                    logger.info(f"ðŸ“¥ Message from @{target_username}: {incoming_text[:50]}...")
                    
                    # Generate and send AI response if enabled
                    if ai:
                        response = await ai.generate_response(ai_prompt, history, incoming_text)
                        
                        if response:
                            # Send response
                            success, error, _ = await self.telegram.send_message(
                                client, f"@{target_username}", response
                            )
                            
                            if success:
                                await self.supabase.add_message(chat_id, 'me', response)
                                
                                # Increment campaign replied count
                                await self.supabase.increment_campaign_replied(campaign_id)
                                
                                await self.supabase.log(
                                    user_id, 'SUCCESS',
                                    f"AI replied to @{target_username}",
                                    campaign_id, account_id
                                )
                                
                                logger.info(f"ðŸ¤– AI replied to @{target_username}")
                                
                                # Add to history for context
                                history.append({'sender': 'them', 'content': incoming_text})
                                history.append({'sender': 'me', 'content': response})
                                
                                # Small delay between responses
                                await asyncio.sleep(random.randint(5, 15))
                            else:
                                logger.error(f"Failed to send AI reply: {error}")
                    
                    # Update target as replied
                    await self.supabase._request(
                        'PATCH',
                        f'outreach_targets?username=eq.{target_username}&campaign_id=eq.{campaign_id}',
                        json={'status': 'replied'}
                    )
                
                # Mark as read in Telegram
                await self.telegram.mark_as_read(client, target_username)
                
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

