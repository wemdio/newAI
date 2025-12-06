import os
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Use service role for backend worker

# General
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Validation
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)")
    # We don't exit here to allow import, but main should check

