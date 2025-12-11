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
    
    async def get_available_account(self, user_id: str, last_account_id: str = None) -> Optional[Dict]:
        """
        Get next available account for user with round-robin rotation
        Args:
            user_id: User ID to fetch accounts for
            last_account_id: ID of the last used account (to avoid using it again immediately)
        Returns None if no accounts available
        """
        # Step 0: Try to reactivate accounts that have finished their cooldown
        # This acts as a lazy scheduler
        await self.supabase.reactivate_expired_pauses(cooldown_hours=24)
        
        accounts = await self.supabase.get_accounts_for_user(user_id)
        
        if not accounts:
            print(f"❌ No accounts found for user {user_id}")
            return None
            
        # Filter available accounts first
        available_accounts = []
        for account in accounts:
            if self._is_daily_limit_reached(account):
                continue
            if self._needs_cooldown(account):
                continue
            available_accounts.append(account)
            
        if not available_accounts:
            print(f"⚠️ All accounts for user {user_id} are unavailable")
            return None
            
        # Round-robin logic:
        # If we have multiple accounts and a last_account_id is provided,
        # try to find an account that is DIFFERENT from the last one.
        if len(available_accounts) > 1 and last_account_id:
            for account in available_accounts:
                if str(account['id']) != str(last_account_id):
                    print(f"✅ Selected next account (Round-Robin): {account['account_name']}")
                    return account
        
        # Fallback: Just take the first available one (sorted by last_used_at ASC from DB)
        selected = available_accounts[0]
        print(f"✅ Selected account: {selected['account_name']}")
        return selected
    
    def _is_daily_limit_reached(self, account: Dict) -> bool:
        """Check if account reached daily message limit"""
        messages_today = account.get('messages_sent_today', 0)
        
        # Use individual account limit if set, otherwise fallback to global default
        limit = account.get('daily_limit')
        if not limit or limit <= 0:
            limit = MAX_MESSAGES_PER_DAY
            
        return messages_today >= limit
    
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
        Pause account temporarily
        """
        print(f"🚫 FloodWait detected for account {account_id}: {wait_seconds}s")
        await self.supabase.pause_account(account_id, wait_seconds)
        
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



