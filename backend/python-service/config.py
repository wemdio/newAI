"""Configuration for AI Messaging Service"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Ensure UTF-8 output to avoid mojibake in logs
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Supabase Configuration (REST API - no database password needed!)
SUPABASE_URL = os.getenv('SUPABASE_URL')
# Prefer Service Role Key (admin) if available, otherwise fallback to Anon Key.
# Accept legacy SUPABASE_SERVICE_KEY if that's what's configured in Timeweb.
SUPABASE_KEY = (
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    or os.getenv('SUPABASE_SERVICE_KEY')
    or os.getenv('SUPABASE_ANON_KEY')
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY (or ANNON/SERVICE_ROLE) must be set")

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')

print(f"🔧 Config: Using Supabase Key ending in ...{SUPABASE_KEY[-4:] if SUPABASE_KEY else 'None'}")
print(f"🔧 Config: Telegram Bot Token found: {'Yes' if TELEGRAM_BOT_TOKEN else 'No'}")


# OpenRouter Configuration (AI Model)
# NOTE: API key is now user-specific and loaded from database (user_config table)
# Each user provides their own OpenRouter API key in the app settings
AI_MODEL = 'google/gemini-3-flash-preview'

# Safety Limits (Anti-ban) - VERY Conservative settings to avoid PeerFlood
MAX_MESSAGES_PER_DAY = int(os.getenv('MAX_MESSAGES_PER_DAY', '25'))  # Safe: 25 messages per day
MESSAGE_DELAY_MIN = int(os.getenv('MESSAGE_DELAY_MIN', '120'))  # seconds (2 min) - delay between processing leads
MESSAGE_DELAY_MAX = int(os.getenv('MESSAGE_DELAY_MAX', '300'))  # seconds (5 min) - delay between processing leads
ACCOUNT_COOLDOWN = int(os.getenv('ACCOUNT_COOLDOWN', '1200'))  # seconds (20 min) - min time between messages from same account

# Daily reset hour (UTC)
DAILY_RESET_HOUR = 0

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

import logging

def setup_logger(name):
    """Configure logger with standard format"""
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(LOG_LEVEL)
        
    return logger

