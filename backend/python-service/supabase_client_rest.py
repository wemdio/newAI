"""Supabase REST API client for AI Messaging Service (no database password needed)"""
import aiohttp
import json
from datetime import datetime
from typing import List, Dict, Optional


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
        print("✅ Connected to Supabase (REST API)")
    
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
    
    async def update_campaign_stats(self, campaign_id: str, leads_contacted: int = 0, hot_leads_found: int = 0):
        """Update campaign statistics"""
        # Note: REST API doesn't support incrementing, so we need to get first, then update
        # For production, consider using RPC functions
        return await self._patch('messaging_campaigns', {'id': campaign_id}, {
            'updated_at': datetime.utcnow().isoformat()
        })
    
    # ============= LEADS =============
    
    async def get_uncontacted_leads(self, user_id: str) -> List[Dict]:
        """Get uncontacted leads - fetches detected_leads with is_contacted=false"""
        try:
            # Get uncontacted detected_leads for this user
            url = f"{self.url}/rest/v1/detected_leads"
            url += f"?select=id,message_id,confidence_score,reasoning,matched_criteria,detected_at"
            url += f"&user_id=eq.{user_id}"
            url += f"&is_contacted=eq.false"
            url += f"&order=detected_at.desc"
            url += f"&limit=100"
            
            async with self.session.get(url) as resp:
                if resp.status != 200:
                    print(f"⚠️ Failed to get uncontacted leads: {resp.status}")
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
            print(f"❌ Error getting uncontacted leads: {e}")
            return []
    
    async def mark_lead_contacted(self, lead_id: int):
        """Mark lead as contacted"""
        return await self._patch('detected_leads', {'id': lead_id}, {'is_contacted': True})
    
    # ============= ACCOUNTS =============
    
    async def get_accounts_for_user(self, user_id: str) -> List[Dict]:
        """Get available accounts"""
        return await self._get(
            'telegram_accounts',
            {'user_id': user_id, 'status': 'active', 'is_available': True},
            order='last_used_at.asc.nullsfirst'
        )
    
    async def update_account_usage(self, account_id: str):
        """Update account usage"""
        # Note: REST API can't increment, need to use RPC or get-then-update
        return await self._patch('telegram_accounts', {'id': account_id}, {
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
    
    async def pause_account(self, account_id: str, duration_seconds: int):
        """Pause account temporarily"""
        return await self._patch('telegram_accounts', {'id': account_id}, {
            'is_available': False,
            'updated_at': datetime.utcnow().isoformat()
        })
    
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
        """Add message to conversation - requires RPC or get-then-update"""
        # Would need Supabase RPC function for array_append
        pass
    
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
    
    async def mark_hot_lead_posted(self, hot_lead_id: str):
        """Mark hot lead as posted"""
        return await self._patch('hot_leads', {'id': hot_lead_id}, {
            'posted_to_channel': True,
            'updated_at': datetime.utcnow().isoformat()
        })

