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
MAX_MESSAGES_PER_DAY = int(os.getenv('MAX_MESSAGES_PER_DAY', '25'))  # Safe: 25 messages per day
MESSAGE_DELAY_MIN = int(os.getenv('MESSAGE_DELAY_MIN', '120'))  # seconds (2 min) - delay between processing leads
MESSAGE_DELAY_MAX = int(os.getenv('MESSAGE_DELAY_MAX', '300'))  # seconds (5 min) - delay between processing leads
ACCOUNT_COOLDOWN = int(os.getenv('ACCOUNT_COOLDOWN', '1200'))  # seconds (20 min) - min time between messages from same account

# Daily reset hour (UTC)
DAILY_RESET_HOUR = 0

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

