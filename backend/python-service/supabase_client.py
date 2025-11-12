"""Supabase database client for AI Messaging Service"""
import asyncpg
import json
from datetime import datetime
from typing import List, Dict, Optional
from config import DATABASE_URL


class SupabaseClient:
    """Async PostgreSQL client for Supabase"""
    
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
    
    async def connect(self):
        """Initialize connection pool"""
        self.pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10
        )
        print("✅ Connected to Supabase database")
    
    async def close(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
    
    # ============= USER CONFIG =============
    
    async def get_user_config(self, user_id: str) -> Optional[Dict]:
        """Get user configuration including OpenRouter API key"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM user_config WHERE user_id = $1",
                user_id
            )
            return dict(row) if row else None
    
    # ============= CAMPAIGNS =============
    
    async def get_active_campaigns(self) -> List[Dict]:
        """Get all running campaigns"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM messaging_campaigns WHERE status = 'running'"
            )
            return [dict(row) for row in rows]
    
    async def update_campaign_stats(self, campaign_id: str, leads_contacted: int = 0, hot_leads_found: int = 0):
        """Update campaign statistics"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE messaging_campaigns 
                SET leads_contacted = leads_contacted + $2,
                    hot_leads_found = hot_leads_found + $3,
                    updated_at = NOW()
                WHERE id = $1
                """,
                campaign_id, leads_contacted, hot_leads_found
            )
    
    # ============= LEADS =============
    
    async def get_uncontacted_leads(self, user_id: str) -> List[Dict]:
        """Get uncontacted leads for specific user/company"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    dl.id as lead_id,
                    dl.message_id,
                    dl.confidence_score,
                    dl.reasoning,
                    dl.matched_criteria,
                    m.username,
                    m.user_id as telegram_user_id,
                    m.message,
                    m.chat_name,
                    m.message_time
                FROM detected_leads dl
                JOIN messages m ON dl.message_id = m.id
                WHERE dl.user_id = $1 
                  AND dl.is_contacted = false
                  AND m.username IS NOT NULL
                ORDER BY dl.detected_at DESC
                LIMIT 100
                """,
                user_id
            )
            return [dict(row) for row in rows]
    
    async def mark_lead_contacted(self, lead_id: int):
        """Mark lead as contacted"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE detected_leads SET is_contacted = true WHERE id = $1",
                lead_id
            )
    
    # ============= ACCOUNTS =============
    
    async def get_accounts_for_user(self, user_id: str) -> List[Dict]:
        """Get available accounts for user"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM telegram_accounts 
                WHERE user_id = $1 
                  AND status = 'active' 
                  AND is_available = true
                ORDER BY last_used_at ASC NULLS FIRST
                """,
                user_id
            )
            return [dict(row) for row in rows]
    
    async def update_account_usage(self, account_id: str):
        """Update account last used time and message counter"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE telegram_accounts 
                SET messages_sent_today = messages_sent_today + 1,
                    last_used_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                """,
                account_id
            )
    
    async def reset_daily_counters(self):
        """Reset daily message counters (run at midnight)"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE telegram_accounts SET messages_sent_today = 0"
            )
    
    async def mark_account_banned(self, account_id: str):
        """Mark account as banned"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE telegram_accounts 
                SET status = 'banned', is_available = false, updated_at = NOW()
                WHERE id = $1
                """,
                account_id
            )
    
    async def pause_account(self, account_id: str, duration_seconds: int):
        """Temporarily pause account (for FloodWait)"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE telegram_accounts 
                SET is_available = false, updated_at = NOW()
                WHERE id = $1
                """,
                account_id
            )
    
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
        
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO ai_conversations (
                    campaign_id, account_id, lead_id, peer_user_id, peer_username,
                    conversation_history, status, last_message_at, messages_count
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), 1)
                RETURNING id
                """,
                campaign_id, account_id, lead_id, peer_user_id, peer_username,
                history
            )
            return row['id']
    
    async def add_message_to_conversation(self, conversation_id: str, role: str, content: str):
        """Add message to conversation history"""
        message = {
            'role': role,
            'content': content,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE ai_conversations 
                SET conversation_history = conversation_history || $2::jsonb,
                    messages_count = messages_count + 1,
                    last_message_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                """,
                conversation_id, json.dumps(message)
            )
    
    async def get_conversation_history(self, conversation_id: str) -> List[Dict]:
        """Get conversation history"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT conversation_history FROM ai_conversations WHERE id = $1",
                conversation_id
            )
            if row and row['conversation_history']:
                return row['conversation_history']
            return []
    
    async def update_conversation_status(self, conversation_id: str, status: str):
        """Update conversation status"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE ai_conversations SET status = $2, updated_at = NOW() WHERE id = $1",
                conversation_id, status
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
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO hot_leads (
                    campaign_id, conversation_id, lead_id, 
                    conversation_history, contact_info, posted_to_channel
                )
                VALUES ($1, $2, $3, $4, $5, false)
                RETURNING id
                """,
                campaign_id, conversation_id, lead_id,
                conversation_history, json.dumps(contact_info)
            )
            return row['id']
    
    async def mark_hot_lead_posted(self, hot_lead_id: str):
        """Mark hot lead as posted to Telegram channel"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE hot_leads SET posted_to_channel = true, updated_at = NOW() WHERE id = $1",
                hot_lead_id
            )

