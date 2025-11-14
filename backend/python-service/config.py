"""Configuration for AI Messaging Service"""
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase Configuration (REST API - no database password needed!)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

# OpenRouter Configuration (Claude)
# NOTE: API key is now user-specific and loaded from database (user_config table)
# Each user provides their own OpenRouter API key in the app settings
CLAUDE_MODEL = 'anthropic/claude-3.5-sonnet'

# Safety Limits (Anti-ban)
MAX_MESSAGES_PER_DAY = int(os.getenv('MAX_MESSAGES_PER_DAY', '25'))
MESSAGE_DELAY_MIN = int(os.getenv('MESSAGE_DELAY_MIN', '30'))  # seconds
MESSAGE_DELAY_MAX = int(os.getenv('MESSAGE_DELAY_MAX', '120'))  # seconds
ACCOUNT_SWITCH_DELAY = int(os.getenv('ACCOUNT_SWITCH_DELAY', '300'))  # seconds (5 min)

# Daily reset hour (UTC)
DAILY_RESET_HOUR = 0

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

