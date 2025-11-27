"""Safety Manager - Anti-ban system with account rotation and limits"""
import asyncio
import random
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from config import (
    MAX_MESSAGES_PER_DAY,
    MESSAGE_DELAY_MIN,
    MESSAGE_DELAY_MAX,
    ACCOUNT_COOLDOWN
)

logger = logging.getLogger('SafetyManager')


class SafetyManager:
    """Manages account rotation, limits, and delays to prevent bans"""
    
    def __init__(self, supabase):
        self.supabase = supabase
        # In-memory tracking of messages sent per account TODAY
        # Format: {account_id: {'count': int, 'date': str}}
        self.account_usage_cache = {}
        self.last_reset_date = None

    async def get_available_account(self, user_id: str) -> Optional[Dict]:
        """
        Get next available account for user with round-robin rotation
        Accounts are rotated automatically (sorted by last_used_at)
        Returns None if no accounts available
        """
        # Fetch all active accounts (filtering is done in Python to support individual limits)
        accounts = await self.supabase.get_accounts_for_user(user_id)
        
        if not accounts:
            logger.warning(f"❌ No available accounts found for user {user_id} (none active)")
            return None
        
        logger.debug(f"🔄 Checking {len(accounts)} accounts for availability...")
        
        for idx, account in enumerate(accounts, 1):
            account_id = str(account['id'])
            account_name = account.get('account_name', account_id[:8])
            
            # Check daily limit (individual)
            if self._is_daily_limit_reached(account):
                logger.debug(f"    ⏭️ Account {account_name} reached daily limit")
                continue
            
            # Check cooldown period (20 min between messages from same account)
            if self._needs_cooldown(account):
                cooldown_left = self._get_cooldown_time_left(account)
                logger.debug(f"    ⏳ Account {account_name} in cooldown: {cooldown_left:.0f}s remaining")
                continue
            
            # Found available account - automatically rotated!
            logger.info(f"    ✅ SELECTED Account: {account_name}")
            return account
        
        logger.warning(f"⚠️ All {len(accounts)} accounts are currently unavailable (limit or cooldown)")
        return None
    
    def _get_next_available_time(self, accounts: list) -> float:
        """Get time until next account becomes available"""
        min_time = float('inf')
        
        for account in accounts:
            if self._is_daily_limit_reached(account):
                continue
            
            cooldown_left = self._get_cooldown_time_left(account)
            if cooldown_left < min_time:
                min_time = cooldown_left
        
        return min_time if min_time != float('inf') else 0
    
    def _is_daily_limit_reached(self, account: Dict) -> bool:
        """Check if account reached daily message limit"""
        account_id = str(account['id'])
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        # Get DB counter
        db_messages_today = account.get('messages_sent_today', 0)
        
        # Check if DB counter is from today
        last_used_at = account.get('last_used_at')
        if last_used_at:
            if isinstance(last_used_at, str):
                last_used_at = datetime.fromisoformat(last_used_at.replace('Z', '+00:00'))
            
            # If last use was on a different day, DB counter is stale
            if last_used_at.date() < datetime.now(timezone.utc).date():
                db_messages_today = 0
        
        # Get in-memory cache counter (for messages sent in this session)
        cache_entry = self.account_usage_cache.get(account_id, {'count': 0, 'date': today_str})
        
        # Reset cache if it's from a different day
        if cache_entry.get('date') != today_str:
            cache_entry = {'count': 0, 'date': today_str}
            self.account_usage_cache[account_id] = cache_entry
        
        # Total messages = max of DB counter and cache counter
        # (cache is more accurate during current session)
        messages_today = max(db_messages_today, cache_entry['count'])
        
        # Use account specific limit or global default
        # Default to 3 if daily_limit is not set in DB (safe default)
        limit = account.get('daily_limit')
        if limit is None:
            limit = 3
        
        is_reached = messages_today >= limit
        
        if is_reached:
            logger.debug(f"    📊 Account {account_id}: {messages_today}/{limit} messages (limit reached)")
        else:
            logger.debug(f"    📊 Account {account_id}: {messages_today}/{limit} messages")
        
        return is_reached
    
    def _needs_cooldown(self, account: Dict) -> bool:
        """Check if account needs cooldown period (20 min between messages)"""
        last_used_at = account.get('last_used_at')
        
        if not last_used_at:
            return False  # Never used, can use now
        
        # Convert to datetime if string
        if isinstance(last_used_at, str):
            last_used_at = datetime.fromisoformat(last_used_at.replace('Z', '+00:00'))
        
        cooldown_period = timedelta(seconds=ACCOUNT_COOLDOWN)
        time_since_last_use = datetime.now(last_used_at.tzinfo) - last_used_at
        
        return time_since_last_use < cooldown_period
    
    def _get_cooldown_time_left(self, account: Dict) -> float:
        """Get remaining cooldown time in seconds (20 min rule)"""
        last_used_at = account.get('last_used_at')
        
        if not last_used_at:
            return 0
        
        # Convert to datetime if string
        if isinstance(last_used_at, str):
            last_used_at = datetime.fromisoformat(last_used_at.replace('Z', '+00:00'))
        
        cooldown_period = timedelta(seconds=ACCOUNT_COOLDOWN)
        time_since_last_use = datetime.now(last_used_at.tzinfo) - last_used_at
        remaining = cooldown_period - time_since_last_use
        
        return max(0, remaining.total_seconds())
    
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
        Mark account as used (update stats in database AND in-memory cache)
        """
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        # Update in-memory cache FIRST (immediate effect for next check)
        if account_id not in self.account_usage_cache:
            self.account_usage_cache[account_id] = {'count': 0, 'date': today_str}
        
        cache_entry = self.account_usage_cache[account_id]
        
        # Reset if different day
        if cache_entry.get('date') != today_str:
            cache_entry = {'count': 0, 'date': today_str}
        
        cache_entry['count'] += 1
        self.account_usage_cache[account_id] = cache_entry
        
        print(f"📊 Account {account_id}: {cache_entry['count']} messages today (in-memory)")
        
        # Then update database (async, for persistence)
        await self.supabase.update_account_usage(account_id)
        print(f"📊 Updated usage stats for account {account_id} in DB")
    
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
        Only runs once per day at 00:00 UTC
        """
        now = datetime.utcnow()
        
        # Reset at midnight UTC
        if now.hour == 0:
            today_str = now.strftime('%Y-%m-%d')
            
            # Check if already reset today to avoid spamming logs/DB every minute
            if self.last_reset_date != today_str:
                logger.info(f"🔄 Resetting daily message counters (New day: {today_str})")
                await self.supabase.reset_daily_counters()
                self.last_reset_date = today_str
            else:
                logger.debug("ℹ️ Daily counters already reset for today")



