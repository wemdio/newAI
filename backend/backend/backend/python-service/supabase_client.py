"""Supabase database client for AI Messaging Service"""
import aiohttp
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from config import SUPABASE_URL, SUPABASE_KEY


class SupabaseClient:
    """Supabase REST API client (no database password needed)"""
    
    def __init__(self):
        self.url = SUPABASE_URL
        self.key = SUPABASE_KEY
        self.headers = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def connect(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession(headers=self.headers)
        print("✅ Connected to Supabase (REST API)")
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
    
    # ============= HELPER METHODS =============
    
    async def _get(self, table: str, filters: Dict = None, select: str = "*", order: str = None, limit: int = None, custom_params: List[str] = None) -> List[Dict]:
        """Generic GET request to Supabase"""
        url = f"{self.url}/rest/v1/{table}?select={select}"
        
        if filters:
            for key, value in filters.items():
                url += f"&{key}=eq.{value}"
        
        if custom_params:
            for param in custom_params:
                url += f"&{param}"
        
        if order:
            url += f"&order={order}"
        
        if limit:
            url += f"&limit={limit}"
            
        async with self.session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            error_text = await resp.text()
            print(f"❌ GET Error {table}: {error_text}")
            return []
    
    async def _post(self, table: str, data: Dict) -> Optional[Dict]:
        """Generic POST request to Supabase"""
        url = f"{self.url}/rest/v1/{table}"
        
        async with self.session.post(url, json=data) as resp:
            if resp.status in [200, 201]:
                result = await resp.json()
                return result[0] if result else None
            error_text = await resp.text()
            print(f"❌ POST Error {table}: {error_text}")
            return None
    
    async def _patch(self, table: str, filters: Dict, data: Dict) -> bool:
        """Generic PATCH request to Supabase"""
        url = f"{self.url}/rest/v1/{table}?"
        
        params = []
        for key, value in filters.items():
            params.append(f"{key}=eq.{value}")
        url += "&".join(params)
        
        async with self.session.patch(url, json=data) as resp:
            if resp.status in [200, 204]:
                return True
            error_text = await resp.text()
            print(f"❌ PATCH Error {table}: {error_text}")
            return False

    async def _rpc(self, function_name: str, params: Dict = None) -> Optional[Dict]:
        """Call Supabase RPC function"""
        url = f"{self.url}/rest/v1/rpc/{function_name}"
        async with self.session.post(url, json=params or {}) as resp:
            if resp.status == 200:
                return await resp.json()
            error_text = await resp.text()
            print(f"❌ RPC Error {function_name}: {error_text}")
            return None
    
    # ============= USER CONFIG =============
    
    async def get_user_config(self, user_id: str) -> Optional[Dict]:
        """Get user configuration including OpenRouter API key"""
        results = await self._get('user_config', {'user_id': user_id})
        return results[0] if results else None
    
    # ============= CAMPAIGNS =============
    
    async def get_active_campaigns(self) -> List[Dict]:
        """Get all running campaigns"""
        return await self._get('messaging_campaigns', {'status': 'running'})
    
    async def update_campaign_stats(self, campaign_id: str, leads_contacted: int = 0, hot_leads_found: int = 0):
        """Update campaign statistics"""
        campaigns = await self._get('messaging_campaigns', {'id': campaign_id})
        if not campaigns:
            return
            
        current = campaigns[0]
        new_contacted = (current.get('leads_contacted') or 0) + leads_contacted
        new_hot = (current.get('hot_leads_found') or 0) + hot_leads_found
        
        await self._patch(
            'messaging_campaigns', 
            {'id': campaign_id},
            {
                'leads_contacted': new_contacted,
                'hot_leads_found': new_hot,
                'updated_at': datetime.utcnow().isoformat()
            }
        )
    
    # ============= LEADS =============
    
    async def get_uncontacted_leads(self, user_id: str) -> List[Dict]:
        """Get uncontacted leads for specific user/company"""
        data = await self._get(
            'detected_leads',
            {'user_id': user_id, 'is_contacted': 'false'},
            select='id,message_id,confidence_score,reasoning,matched_criteria,detected_at,messages(username,user_id,message,chat_name,message_time)',
            order='detected_at.desc',
            limit=100
        )
        
        leads = []
        for item in data:
            msg = item.get('messages')
            if not msg or not msg.get('username'):
                continue
                
            leads.append({
                'lead_id': item['id'],
                'message_id': item['message_id'],
                'confidence_score': item['confidence_score'],
                'reasoning': item['reasoning'],
                'matched_criteria': item['matched_criteria'],
                'username': msg['username'],
                'telegram_user_id': msg['user_id'],
                'message': msg['message'],
                'chat_name': msg['chat_name'],
                'message_time': msg['message_time']
            })
            
        return leads
    
    async def mark_lead_contacted(self, lead_id: int):
        """Mark lead as contacted"""
        await self._patch('detected_leads', {'id': lead_id}, {'is_contacted': True})
    
    # ============= ACCOUNTS =============
    
    async def get_accounts_for_user(self, user_id: str) -> List[Dict]:
        """Get available accounts for user"""
        return await self._get(
            'telegram_accounts',
            {
                'user_id': user_id,
                'status': 'active',
                'is_available': 'true'
            },
            order='last_used_at.asc.nullsfirst'
        )
    
    async def update_account_usage(self, account_id: str):
        """Update account last used time and message counter"""
        accounts = await self._get('telegram_accounts', {'id': account_id})
        if not accounts:
            return
            
        current = accounts[0]
        sent_today = (current.get('messages_sent_today') or 0) + 1
        
        await self._patch(
            'telegram_accounts',
            {'id': account_id},
            {
                'messages_sent_today': sent_today,
                'last_used_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
        )
    
    async def reset_daily_counters(self):
        """Reset daily message counters (run at midnight)"""
        result = await self._rpc('reset_daily_stats')
        if result is None:
             pass
    
    async def mark_account_banned(self, account_id: str):
        """Mark account as banned"""
        await self._patch(
            'telegram_accounts',
            {'id': account_id},
            {
                'status': 'banned',
                'is_available': False,
                'updated_at': datetime.utcnow().isoformat()
            }
        )
    
    async def pause_account(self, account_id: str, duration_seconds: int):
        """Temporarily pause account (for FloodWait)"""
        await self._patch(
            'telegram_accounts',
            {'id': account_id},
            {
                'is_available': False,
                'updated_at': datetime.utcnow().isoformat()
            }
        )
        
    async def reactivate_expired_pauses(self, cooldown_hours: int = 24):
        """Reactivate accounts that have been paused for more than N hours"""
        # Calculate cutoff time
        cutoff_time = (datetime.utcnow() - timedelta(hours=cooldown_hours)).isoformat()
        
        # Find accounts: status='active', is_available=false, updated_at < cutoff
        # We assume if it was updated long ago and is active but unavailable -> it was a pause
        # Note: We need a custom query param for less than
        
        accounts = await self._get(
            'telegram_accounts',
            filters={
                'status': 'active',
                'is_available': 'false'
            },
            custom_params=[f'updated_at=lt.{cutoff_time}']
        )
        
        if not accounts:
            return 0
            
        count = 0
        for acc in accounts:
            print(f"♻️ Reactivating account {acc.get('account_name')} (cooldown expired)")
            success = await self._patch(
                'telegram_accounts',
                {'id': acc['id']},
                {
                    'is_available': True,
                    'updated_at': datetime.utcnow().isoformat()
                }
            )
            if success:
                count += 1
                
        return count
    
    # ============= CONVERSATIONS =============
    
    async def create_conversation(
        self, 
        campaign_id: str, 
        account_id: str, 
        lead_id: int,
        peer_user_id: int,
        peer_username: str,
        first_message: str
    ) -> str:
        """Create new conversation record"""
        history = [
            {
                'role': 'assistant',
                'content': first_message,
                'timestamp': datetime.utcnow().isoformat()
            }
        ]
        
        data = {
            'campaign_id': campaign_id,
            'account_id': account_id,
            'lead_id': lead_id,
            'peer_user_id': peer_user_id,
            'peer_username': peer_username,
            'conversation_history': history,
            'status': 'active',
            'last_message_at': datetime.utcnow().isoformat(),
            'messages_count': 1
        }
        
        result = await self._post('ai_conversations', data)
        return result['id'] if result else None
    
    async def add_message_to_conversation(self, conversation_id: str, role: str, content: str):
        """Add message to conversation history"""
        convs = await self._get('ai_conversations', {'id': conversation_id})
        if not convs:
            return
            
        current = convs[0]
        history = current.get('conversation_history') or []
        
        new_message = {
            'role': role,
            'content': content,
            'timestamp': datetime.utcnow().isoformat()
        }
        history.append(new_message)
        
        await self._patch(
            'ai_conversations',
            {'id': conversation_id},
            {
                'conversation_history': history,
                'messages_count': (current.get('messages_count') or 0) + 1,
                'last_message_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
        )
    
    async def get_conversation_history(self, conversation_id: str) -> List[Dict]:
        """Get conversation history"""
        convs = await self._get('ai_conversations', {'id': conversation_id})
        if convs and convs[0].get('conversation_history'):
            return convs[0]['conversation_history']
        return []
    
    async def update_conversation_status(self, conversation_id: str, status: str):
        """Update conversation status"""
        await self._patch(
            'ai_conversations',
            {'id': conversation_id},
            {'status': status, 'updated_at': datetime.utcnow().isoformat()}
        )
    
    # ============= HOT LEADS =============
    
    async def create_hot_lead(
        self,
        campaign_id: str,
        conversation_id: str,
        lead_id: int,
        conversation_history: List[Dict],
        contact_info: Dict
    ) -> str:
        """Create hot lead record"""
        data = {
            'campaign_id': campaign_id,
            'conversation_id': conversation_id,
            'lead_id': lead_id,
            'conversation_history': conversation_history,
            'contact_info': contact_info,
            'posted_to_channel': False
        }
        
        result = await self._post('hot_leads', data)
        return result['id'] if result else None
    
    async def mark_hot_lead_posted(self, hot_lead_id: str):
        """Mark hot lead as posted to Telegram channel"""
        await self._patch(
            'hot_leads',
            {'id': hot_lead_id},
            {'posted_to_channel': True, 'updated_at': datetime.utcnow().isoformat()}
        )
