"""Supabase REST API client for AI Messaging Service (no database password needed)"""
import aiohttp
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional

logger = logging.getLogger('SupabaseClient')


class SupabaseClient:
    """Supabase REST API client"""
    
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.headers = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Content-Type': 'application/json'
        }
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def connect(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession(headers=self.headers)
        logger.info("✅ Connected to Supabase (REST API)")
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
    
    # ============= HELPER METHODS =============
    
    async def _get(self, table: str, filters: Dict = None, select: str = "*", order: str = None, limit: int = None) -> List[Dict]:
        """Generic GET request"""
        url = f"{self.url}/rest/v1/{table}?select={select}"
        
        if filters:
            for key, value in filters.items():
                url += f"&{key}=eq.{value}"
        
        if order:
            url += f"&order={order}"
        
        if limit:
            url += f"&limit={limit}"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            return []
    
    async def _post(self, table: str, data: Dict) -> Optional[Dict]:
        """Generic POST request"""
        url = f"{self.url}/rest/v1/{table}"
        headers = {**self.headers, 'Prefer': 'return=representation'}
        
        async with self.session.post(url, json=data, headers=headers) as resp:
            if resp.status in [200, 201]:
                result = await resp.json()
                return result[0] if result else None
            return None
    
    async def _patch(self, table: str, filters: Dict, data: Dict) -> bool:
        """Generic PATCH request"""
        url = f"{self.url}/rest/v1/{table}?"
        
        for key, value in filters.items():
            url += f"&{key}=eq.{value}"
        
        async with self.session.patch(url, json=data) as resp:
            return resp.status in [200, 204]
    
    # ============= USER CONFIG =============
    
    async def get_user_config(self, user_id: str) -> Optional[Dict]:
        """Get user configuration"""
        results = await self._get('user_config', {'user_id': user_id})
        return results[0] if results else None
    
    # ============= CAMPAIGNS =============
    
    async def get_active_campaigns(self) -> List[Dict]:
        """Get running campaigns"""
        return await self._get('messaging_campaigns', {'status': 'running'})
    
    async def get_campaign_status(self, campaign_id: str) -> Optional[str]:
        """Get campaign status by ID"""
        campaigns = await self._get('messaging_campaigns', {'id': campaign_id}, select='status')
        if campaigns:
            return campaigns[0].get('status')
        return None
    
    async def update_campaign_stats(self, campaign_id: str, leads_contacted: int = 0, hot_leads_found: int = 0):
        """Update campaign statistics"""
        # Note: REST API doesn't support incrementing, so we need to get first, then update
        # For production, consider using RPC functions
        return await self._patch('messaging_campaigns', {'id': campaign_id}, {
            'updated_at': datetime.utcnow().isoformat()
        })
    
    # ============= LEADS =============
    
    async def get_uncontacted_leads(self, user_id: str) -> List[Dict]:
        """Get uncontacted leads - fetches detected_leads with is_contacted=false (last 24h only)"""
        try:
            # Calculate timestamp for 24 hours ago
            twenty_four_hours_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            
            logger.info(f"🔍 Fetching uncontacted leads for user {user_id}")
            logger.info(f"   ⏰ From: {twenty_four_hours_ago} (last 24 hours)")
            
            # Get uncontacted detected_leads for this user (last 24 hours only)
            url = f"{self.url}/rest/v1/detected_leads"
            url += f"?select=id,message_id,confidence_score,reasoning,matched_criteria,detected_at"
            url += f"&user_id=eq.{user_id}"
            url += f"&is_contacted=eq.false"
            url += f"&detected_at=gte.{twenty_four_hours_ago}"  # Only last 24 hours
            url += f"&order=detected_at.desc"
            url += f"&limit=100"
            
            async with self.session.get(url) as resp:
                if resp.status != 200:
                    logger.warning(f"⚠️ Failed to get uncontacted leads: {resp.status}")
                    return []
                
                detected_leads = await resp.json()
                
                if not detected_leads:
                    return []
                
                # Get associated messages for each lead
                result = []
                for lead in detected_leads:
                    # Get message details
                    msg_url = f"{self.url}/rest/v1/messages"
                    msg_url += f"?select=username,user_id,message,chat_name,message_time"
                    msg_url += f"&id=eq.{lead['message_id']}"
                    
                    async with self.session.get(msg_url) as msg_resp:
                        if msg_resp.status == 200:
                            messages = await msg_resp.json()
                            if messages:
                                message = messages[0]
                                # Combine lead and message data
                                result.append({
                                    'lead_id': lead['id'],
                                    'message_id': lead['message_id'],
                                    'confidence_score': lead['confidence_score'],
                                    'reasoning': lead['reasoning'],
                                    'matched_criteria': lead['matched_criteria'],
                                    'username': message.get('username'),
                                    'telegram_user_id': message.get('user_id'),
                                    'message': message.get('message'),
                                    'chat_name': message.get('chat_name'),
                                    'message_time': message.get('message_time')
                                })
                
                return result
                
        except Exception as e:
            logger.error(f"❌ Error getting uncontacted leads: {e}")
            return []
            
    async def get_lead_details(self, lead_id: int) -> Optional[Dict]:
        """Get detailed lead info by ID"""
        try:
            # Get lead
            url = f"{self.url}/rest/v1/detected_leads"
            url += f"?select=*"
            url += f"&id=eq.{lead_id}"
            
            async with self.session.get(url) as resp:
                if resp.status != 200:
                    return None
                leads = await resp.json()
                if not leads:
                    return None
                lead = leads[0]
            
            # Get associated message
            msg_url = f"{self.url}/rest/v1/messages"
            msg_url += f"?select=*"
            msg_url += f"&id=eq.{lead['message_id']}"
            
            async with self.session.get(msg_url) as msg_resp:
                if msg_resp.status == 200:
                    messages = await msg_resp.json()
                    if messages:
                        message = messages[0]
                        # Combine info
                        lead['original_message'] = message
                        return lead
            
            return lead
            
        except Exception as e:
            logger.error(f"❌ Error getting lead details: {e}")
            return None
    
    async def mark_lead_contacted(self, lead_id: int):
        """Mark lead as contacted"""
        return await self._patch('detected_leads', {'id': lead_id}, {'is_contacted': True})
    
    async def skip_lead_with_reason(self, lead_id: int, reason: str):
        """Mark lead as skipped with a reason (e.g., privacy_premium_required, write_forbidden)"""
        print(f"      📝 Marking lead {lead_id} as skipped: {reason}")
        return await self._patch('detected_leads', {'id': lead_id}, {
            'is_contacted': True,  # Mark as processed so it won't be retried
            'skip_reason': reason
        })
    
    # ============= MESSAGE QUEUE =============
    
    async def get_pending_messages(self) -> List[Dict]:
        """Get pending messages from queue"""
        url = f"{self.url}/rest/v1/message_queue?select=*&status=eq.pending&order=created_at.asc&limit=10"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            return []
    
    async def update_message_queue_status(self, msg_id: int, status: str, error: str = None):
        """Update message queue status"""
        from datetime import datetime
        data = {
            'status': status,
            'processed_at': datetime.utcnow().isoformat()
        }
        if error:
            data['error'] = error
        return await self._patch('message_queue', {'id': msg_id}, data)
    
    async def get_account_by_id(self, account_id: str) -> Optional[Dict]:
        """Get single account by ID"""
        url = f"{self.url}/rest/v1/telegram_accounts?select=*&id=eq.{account_id}"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                accounts = await resp.json()
                return accounts[0] if accounts else None
            return None
    
    # ============= ACCOUNTS =============
    
    async def get_accounts_for_user(self, user_id: str) -> List[Dict]:
        """Get available accounts - fetches all and filters in Python for better debugging"""
        # Build URL - Fetch ALL accounts for user to debug why they aren't being picked up
        url = f"{self.url}/rest/v1/telegram_accounts?select=*"
        url += f"&user_id=eq.{user_id}"
        # Removed db-side limit check to support individual account limits
        url += f"&order=last_used_at.asc.nullsfirst"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                all_accounts = await resp.json()
                
                # Filter in Python
                active_accounts = []
                for acc in all_accounts:
                    # Check status
                    if acc.get('status') != 'active':
                        # logger.debug(f"⚠️ Account {acc.get('account_name')} skipped: status is '{acc.get('status')}'")
                        continue
                        
                    # Check availability
                    # Allow None to be treated as available (default behavior)
                    if acc.get('is_available') is False:
                         logger.warning(f"⚠️ Account {acc.get('account_name')} skipped: is_available is False (paused/cooldown)")
                         continue
                         
                    active_accounts.append(acc)
                
                if all_accounts and not active_accounts:
                    logger.warning(f"❌ Found {len(all_accounts)} accounts for user but NONE are active/available!")
                    # Log reasons for the first few to help debug
                    for acc in all_accounts[:3]:
                        logger.info(f"   - {acc.get('account_name')}: status={acc.get('status')}, is_available={acc.get('is_available')}")
                    
                return active_accounts
            else:
                error_text = await resp.text()
                logger.error(f"❌ DEBUG: Error response: {error_text}")
                return []
    
    async def update_account_usage(self, account_id: str):
        """Update account usage and increment counters"""
        # Get current values first (REST API limitation)
        accounts = await self._get('telegram_accounts', {'id': account_id})
        if not accounts:
            return False
        
        account = accounts[0]
        
        # Check if we need to reset daily counter
        last_used = account.get('last_used_at')
        messages_today = account.get('messages_sent_today', 0)
        
        if last_used:
            last_used_dt = datetime.fromisoformat(last_used.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            
            # If last use was on a different day, reset counter
            if last_used_dt.date() < now.date():
                messages_today = 0
                logger.info(f"   🔄 Reset daily counter for account {account_id} (new day)")
        
        # Increment counters
        messages_today = messages_today + 1
        total_sent = account.get('total_messages_sent', 0) + 1
        reliability = account.get('reliability_score', 50)
        
        # Increase reliability slightly with each successful message (max 100)
        if reliability < 100:
            reliability = min(100, reliability + 1)
        
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'messages_sent_today': messages_today,
            'total_messages_sent': total_sent,
            'reliability_score': reliability,
            'last_used_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        })
    
    async def reset_daily_counters(self):
        """Reset daily counters - requires RPC function"""
        # Would need to implement as Supabase RPC function
        pass
    
    async def mark_account_banned(self, account_id: str):
        """Mark account as banned"""
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'status': 'banned',
            'is_available': False,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    async def mark_account_error(self, account_id: str, error_reason: str = 'Connection error'):
        """Mark account as having an error (e.g., proxy failure)"""
        logger.warning(f"⚠️ Marking account {account_id} as error: {error_reason}")
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'status': 'error',
            'is_available': False,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    async def pause_account(self, account_id: str, duration_seconds: int):
        """Pause account temporarily"""
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'is_available': False,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    async def get_stuck_accounts(self) -> List[Dict]:
        """Get accounts that might be stuck in unavailable state"""
        # status='active' but is_available=false
        url = f"{self.url}/rest/v1/telegram_accounts?select=*"
        url += f"&status=eq.active"
        url += f"&is_available=is.false"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            return []

    async def unpause_account(self, account_id: str):
        """Unpause account (make available again)"""
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'is_available': True,
            'updated_at': datetime.utcnow().isoformat()
        })

    async def get_accounts_needing_reconnect(self) -> List[Dict]:
        """Get accounts that need reconnection (e.g., proxy changed)"""
        url = f"{self.url}/rest/v1/telegram_accounts?select=*"
        url += f"&needs_reconnect=is.true"
        
        async with self.session.get(url) as resp:
            if resp.status == 200:
                accounts = await resp.json()
                return accounts
            return []
    
    async def clear_reconnect_flag(self, account_id: str) -> bool:
        """Clear the needs_reconnect flag after successful reconnection"""
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'needs_reconnect': False,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    # ============= CONVERSATIONS =============
    
    async def check_existing_conversation(self, campaign_id: str, peer_user_id: int) -> bool:
        """Check if conversation already exists with this user in this campaign"""
        try:
            url = f"{self.url}/rest/v1/ai_conversations"
            url += f"?select=id"
            url += f"&campaign_id=eq.{campaign_id}"
            url += f"&peer_user_id=eq.{peer_user_id}"
            url += f"&status=in.(active,waiting,hot_lead)"  # Any active conversation
            url += f"&limit=1"
            
            async with self.session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return len(data) > 0
                return False
        except Exception as e:
            logger.error(f"⚠️ Error checking existing conversation: {e}")
            return False  # On error, assume no conversation (safer to message)
    
    async def create_conversation(
        self, 
        campaign_id: str, 
        account_id: str, 
        lead_id: int,
        peer_user_id: int,
        peer_username: str,
        first_message: str
    ) -> str:
        """Create conversation"""
        history = [{
            'role': 'assistant',
            'content': first_message,
            'timestamp': datetime.utcnow().isoformat()
        }]
        
        result = await self._post('ai_conversations', {
            'campaign_id': campaign_id,
            'account_id': account_id,
            'lead_id': lead_id,
            'peer_user_id': peer_user_id,
            'peer_username': peer_username,
            'conversation_history': history,
            'status': 'active',
            'last_message_at': datetime.utcnow().isoformat(),
            'messages_count': 1
        })
        
        return result['id'] if result else None
    
    async def add_message_to_conversation(self, conversation_id: str, role: str, content: str):
        """Add message to conversation history"""
        # Get current conversation
        results = await self._get('ai_conversations', {'id': conversation_id}, select='conversation_history')
        if not results:
            return False
        
        # Get existing history
        history = results[0].get('conversation_history', [])
        if history is None:
            history = []
        
        # Add new message
        now_iso = datetime.utcnow().isoformat()
        history.append({
            'role': role,
            'content': content,
            'timestamp': now_iso
        })
        
        # Update conversation
        return await self._patch('ai_conversations', {'id': conversation_id}, {
            'conversation_history': history,
            'updated_at': now_iso,
            'last_message_at': now_iso,
            'messages_count': len(history)
        })
    
    async def get_conversation_history(self, conversation_id: str) -> List[Dict]:
        """Get conversation history"""
        results = await self._get('ai_conversations', {'id': conversation_id}, select='conversation_history')
        if results and results[0].get('conversation_history'):
            return results[0]['conversation_history']
        return []
    
    async def update_conversation_status(self, conversation_id: str, status: str):
        """Update conversation status"""
        return await self._patch('ai_conversations', {'id': conversation_id}, {
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    # ============= HOT LEADS =============
    
    async def get_existing_hot_lead(self, conversation_id: str) -> Optional[Dict]:
        """Check if hot_lead already exists for this conversation"""
        try:
            url = f"{self.url}/rest/v1/hot_leads"
            url += f"?select=id,conversation_history,created_at"
            url += f"&conversation_id=eq.{conversation_id}"
            url += f"&limit=1"
            
            async with self.session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data[0] if data else None
                return None
        except Exception as e:
            logger.error(f"⚠️ Error checking existing hot_lead: {e}")
            return None
    
    async def create_hot_lead(
        self,
        campaign_id: str,
        conversation_id: str,
        lead_id: int,
        conversation_history: List[Dict],
        contact_info: Dict
    ) -> str:
        """Create hot lead"""
        result = await self._post('hot_leads', {
            'campaign_id': campaign_id,
            'conversation_id': conversation_id,
            'lead_id': lead_id,
            'conversation_history': conversation_history,
            'contact_info': contact_info,
            'posted_to_channel': False
        })
        
        return result['id'] if result else None
    
    async def update_hot_lead_history(self, hot_lead_id: str, conversation_history: List[Dict]) -> bool:
        """Update hot lead conversation history with new messages"""
        return await self._patch('hot_leads', {'id': hot_lead_id}, {
            'conversation_history': conversation_history,
            'updated_at': datetime.utcnow().isoformat()
        })
    
    async def mark_hot_lead_posted(self, hot_lead_id: str):
        """Mark hot lead as posted"""
        return await self._patch('hot_leads', {'id': hot_lead_id}, {
            'posted_to_channel': True,
            'updated_at': datetime.utcnow().isoformat()
        })

