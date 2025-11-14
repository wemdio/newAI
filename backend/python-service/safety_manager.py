"""Safety Manager - Anti-ban system with account rotation and limits"""
import asyncio
import random
from datetime import datetime, timedelta
from typing import Optional, Dict
from config import (
    MAX_MESSAGES_PER_DAY,
    MESSAGE_DELAY_MIN,
    MESSAGE_DELAY_MAX,
    ACCOUNT_SWITCH_DELAY
)


class SafetyManager:
    """Manages account rotation, limits, and delays to prevent bans"""
    
    def __init__(self, supabase):
        self.supabase = supabase
        self.account_usage = {}  # In-memory tracking
    
    async def get_available_account(self, user_id: str) -> Optional[Dict]:
        """
        Get next available account for user with SMART rotation
        Prioritizes reliable, proven accounts over new ones
        Returns None if no accounts available
        """
        accounts = await self.supabase.get_accounts_for_user(user_id)
        
        if not accounts:
            print(f"❌ No accounts found for user {user_id}")
            return None
        
        # Sort accounts by priority (smart rotation)
        accounts = self._sort_by_priority(accounts)
        
        for account in accounts:
            account_id = str(account['id'])
            account_name = account['account_name']
            
            # Check daily limit (adjusted for account age)
            daily_limit = self._get_daily_limit(account)
            if self._is_daily_limit_reached(account, daily_limit):
                print(f"⏭️ Account {account_name} reached daily limit ({daily_limit})")
                continue
            
            # Check cooldown period since last use
            if self._needs_cooldown(account):
                print(f"⏳ Account {account_name} in cooldown period")
                continue
            
            # Found available account
            priority = self._get_account_priority(account)
            total_msgs = account.get('total_messages_sent', 0)
            print(f"✅ Selected account: {account_name}")
            print(f"   📊 Priority: {priority} | Lifetime messages: {total_msgs} | Limit today: {daily_limit}")
            return account
        
        print(f"⚠️ All accounts for user {user_id} are unavailable")
        return None
    
    def _sort_by_priority(self, accounts: list) -> list:
        """
        Sort accounts by priority (reliability_score, total_messages_sent)
        Higher priority accounts are used first
        """
        def priority_key(account):
            reliability = account.get('reliability_score', 50)
            total_sent = account.get('total_messages_sent', 0)
            # Combine: reliability (0-100) + scaled total_sent
            return (reliability * 10) + min(total_sent, 1000)
        
        return sorted(accounts, key=priority_key, reverse=True)
    
    def _get_account_priority(self, account: Dict) -> str:
        """Get human-readable priority level"""
        total_sent = account.get('total_messages_sent', 0)
        age_days = self._get_account_age_days(account)
        
        if total_sent > 200 and age_days > 7:
            return "🔥 HIGH (Proven)"
        elif total_sent > 50 or age_days > 3:
            return "⚡ MEDIUM (Warming)"
        else:
            return "🐣 LOW (New/Cold)"
    
    def _get_account_age_days(self, account: Dict) -> int:
        """Get account age in days since added to system"""
        created_at = account.get('created_at')
        if not created_at:
            return 0
        
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        
        age = datetime.now(created_at.tzinfo) - created_at
        return age.days
    
    def _get_daily_limit(self, account: Dict) -> int:
        """
        Get daily message limit for account (adjusted by maturity)
        New/cold accounts get lower limits for safety
        """
        total_sent = account.get('total_messages_sent', 0)
        age_days = self._get_account_age_days(account)
        
        # New/cold accounts: conservative limit
        if total_sent < 50 or age_days < 3:
            return 10  # Only 10 messages/day for new accounts
        
        # Warming accounts: moderate limit
        elif total_sent < 200 or age_days < 7:
            return 20  # 20 messages/day for warming accounts
        
        # Proven accounts: full limit
        else:
            return MAX_MESSAGES_PER_DAY  # 25+ messages/day for proven accounts
    
    def _is_daily_limit_reached(self, account: Dict, daily_limit: int = None) -> bool:
        """Check if account reached daily message limit"""
        if daily_limit is None:
            daily_limit = MAX_MESSAGES_PER_DAY
        
        messages_today = account.get('messages_sent_today', 0)
        return messages_today >= daily_limit
    
    def _needs_cooldown(self, account: Dict) -> bool:
        """Check if account needs cooldown period"""
        last_used_at = account.get('last_used_at')
        
        if not last_used_at:
            return False  # Never used, can use now
        
        # Convert to datetime if string
        if isinstance(last_used_at, str):
            last_used_at = datetime.fromisoformat(last_used_at.replace('Z', '+00:00'))
        
        cooldown_period = timedelta(seconds=ACCOUNT_SWITCH_DELAY)
        time_since_last_use = datetime.now(last_used_at.tzinfo) - last_used_at
        
        return time_since_last_use < cooldown_period
    
    async def get_message_delay(self) -> float:
        """
        Get random delay between messages (human-like behavior)
        Returns delay in seconds
        """
        delay = random.uniform(MESSAGE_DELAY_MIN, MESSAGE_DELAY_MAX)
        print(f"⏱️ Waiting {delay:.1f}s before next message")
        return delay
    
    async def mark_account_used(self, account_id: str):
        """
        Mark account as used (update stats in database)
        """
        await self.supabase.update_account_usage(account_id)
        print(f"📊 Updated usage stats for account {account_id}")
    
    async def handle_flood_wait(self, account_id: str, wait_seconds: int):
        """
        Handle FloodWait error from Telegram
        Pause account temporarily and decrease reliability score
        """
        print(f"🚫 FloodWait detected for account {account_id}: {wait_seconds}s")
        await self.supabase.pause_account(account_id, wait_seconds)
        
        # Decrease reliability score (FloodWait = account is stressed)
        # This will lower its priority in rotation
        print(f"   📉 Decreasing reliability score due to FloodWait")
        
        # Schedule reactivation after wait period
        # Note: In production, use a scheduler or cron job
        print(f"⏸️ Account {account_id} paused for {wait_seconds}s")
    
    async def handle_account_ban(self, account_id: str):
        """
        Handle account ban
        Mark account as banned in database
        """
        print(f"🔒 Account {account_id} BANNED - marking as unavailable")
        await self.supabase.mark_account_banned(account_id)
    
    async def check_and_reset_daily_counters(self):
        """
        Check if it's time to reset daily counters (call at startup and hourly)
        """
        current_hour = datetime.utcnow().hour
        
        # Reset at midnight UTC
        if current_hour == 0:
            print("🔄 Resetting daily message counters")
            await self.supabase.reset_daily_counters()
    
    def get_account_switch_delay(self) -> int:
        """Get delay before switching to next account"""
        return ACCOUNT_SWITCH_DELAY



