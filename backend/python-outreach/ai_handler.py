import aiohttp
import re
import asyncio
from typing import List, Dict
from loguru import logger
from database import db

class AIHandler:
    def __init__(self, user_id):
        self.user_id = user_id
        self.api_key = None
        self.model = "google/gemini-3-pro-preview" # Default, maybe configurable later

    async def load_config(self):
        """Fetches OpenRouter API key for the user."""
        try:
            client = db.get_client()
            # Assuming user_configs table exists and has openrouter_api_key
            # Use 'maybe_single' or check list
            response = client.table('user_config').select('openrouter_api_key').eq('user_id', self.user_id).execute()
            if response.data:
                self.api_key = response.data[0].get('openrouter_api_key')
        except Exception as e:
            logger.error(f"Failed to load user config for {self.user_id}: {e}")

    def _filter_reasoning(self, response: str) -> str:
        if not response:
            return response
        
        reasoning_patterns = [
            r'Thinking:.*?(?=\n\n|\Z)',
            r'Reasoning:.*?(?=\n\n|\Z)',
            r'Let me think.*?(?=\n\n|\Z)',
            r'Analysis:.*?(?=\n\n|\Z)',
            r'\[REASONING\].*?\[/REASONING\]',
            r'<thinking>.*?</thinking>',
        ]
        
        cleaned = response
        for pattern in reasoning_patterns:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE | re.DOTALL)
        
        return re.sub(r'\n{3,}', '\n\n', cleaned).strip()

    async def generate_response(self, history: List[Dict], system_prompt: str = "") -> str:
        if not self.api_key:
            await self.load_config()
            if not self.api_key:
                logger.warning(f"No OpenRouter API key for user {self.user_id}")
                return None

        if not system_prompt:
            system_prompt = """
            Ты - дружелюбный помощник. Твоя задача - вести переписку в Telegram.
            Отвечай коротко, естественно и по делу. Не используй сложные обороты.
            Твоя цель - заинтересовать собеседника и вывести на диалог.
            """

        messages = [{'role': 'system', 'content': system_prompt}]
        for msg in history:
            messages.append({
                'role': 'user' if msg['sender'] == 'them' else 'assistant',
                'content': msg['content']
            })

        url = 'https://openrouter.ai/api/v1/chat/completions'
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://telegram-outreach.app', 
            'X-Title': 'Telegram Outreach'
        }
        
        payload = {
            'model': self.model,
            'messages': messages,
            'temperature': 0.7,
            'max_tokens': 1000
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        response_text = data['choices'][0]['message']['content']
                        return self._filter_reasoning(response_text)
                    else:
                        err = await resp.text()
                        logger.error(f"AI API Error: {resp.status} - {err}")
                        return None
        except Exception as e:
            logger.error(f"AI Generation failed: {e}")
            return None

