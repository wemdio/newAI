"""Configuration for AI Messaging Service"""
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase Configuration (REST API - no database password needed!)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

# OpenRouter Configuration (AI Model)
# NOTE: API key is now user-specific and loaded from database (user_config table)
# Each user provides their own OpenRouter API key in the app settings
AI_MODEL = 'google/gemini-3-pro-preview'

# Safety Limits (Anti-ban) - VERY Conservative settings to avoid PeerFlood
MAX_MESSAGES_PER_DAY = int(os.getenv('MAX_MESSAGES_PER_DAY', '5'))  # Ultra-safe: 5 messages per day
MESSAGE_DELAY_MIN = int(os.getenv('MESSAGE_DELAY_MIN', '240'))  # seconds (4 min)
MESSAGE_DELAY_MAX = int(os.getenv('MESSAGE_DELAY_MAX', '600'))  # seconds (10 min)
ACCOUNT_SWITCH_DELAY = int(os.getenv('ACCOUNT_SWITCH_DELAY', '600'))  # seconds (10 min)

# Daily reset hour (UTC)
DAILY_RESET_HOUR = 0

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

