
# Creating a comprehensive structure for the Cursor prompt
# This will be a structured prompt that covers all aspects needed

prompt_structure = {
    "project_overview": {
        "name": "Telegram Lead Scanner & Analyzer",
        "description": "An automated system that analyzes Telegram channel messages hourly and identifies relevant leads based on user-defined criteria"
    },
    "technical_stack": {
        "runtime": "Node.js",
        "database": "Supabase (using MCP for connection)",
        "ai_model": "google/gemini-2.0-flash-001 via OpenRouter API",
        "telegram": "node-telegram-bot-api",
        "scheduling": "node-cron or similar"
    },
    "core_requirements": [
        "Hourly automated job to scan last hour of messages from Supabase",
        "AI-powered lead matching based on user prompt",
        "Telegram bot for posting found leads to private channel",
        "Web interface for configuration and lead display",
        "Zero hallucination lead detection system"
    ],
    "data_schema": {
        "input_table": "messages",
        "fields": [
            "id (int8)",
            "message_time (timestamptz)",
            "chat_name (text)",
            "first_name (text)",
            "last_name (text)",
            "username (text)",
            "bio (text)",
            "message (text)",
            "created_at (timestamptz)",
            "user_id (int8)",
            "profile_link (text)"
        ]
    }
}

print("COMPREHENSIVE CURSOR AI PROMPT STRUCTURE")
print("=" * 80)
print("\nThis structure will be used to create the detailed prompt...")
print(f"\nProject: {prompt_structure['project_overview']['name']}")
print(f"Description: {prompt_structure['project_overview']['description']}")
