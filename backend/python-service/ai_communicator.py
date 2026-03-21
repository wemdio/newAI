"""AI Communicator - Handles conversation with leads using Gemini 3 Pro Preview"""
import os
import aiohttp
import json
import re
from typing import List, Dict, Tuple
from config import AI_MODEL
from tracing import trace_llm_call


class AICommunicator:
    """Handles AI-powered conversations using Gemini 3 Pro Preview via OpenRouter"""
    
    def __init__(self, communication_prompt: str, hot_lead_criteria: str, openrouter_api_key: str):
        self.communication_prompt = communication_prompt
        self.hot_lead_criteria = hot_lead_criteria
        self.openrouter_api_key = openrouter_api_key
        
        if not self.openrouter_api_key:
            raise ValueError("OpenRouter API key is required for user")
    
    def _filter_reasoning(self, response: str) -> str:
        """
        Remove AI's internal thinking/reasoning patterns from response
        This prevents reasoning artifacts from being sent to leads
        
        Args:
            response: Raw AI response
            
        Returns:
            Cleaned response without reasoning patterns
        """
        if not response:
            return response
        
        # Common reasoning patterns to remove
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
        
        # Remove multiple blank lines
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        
        return cleaned.strip()
    
    async def generate_first_message(self, lead_info: Dict) -> str:
        """
        Generate initial outreach message for a lead
        
        Args:
            lead_info: Dictionary with lead information
                - username: Telegram username
                - message: Original message that triggered detection
                - reasoning: Why lead was detected
                - confidence_score: AI confidence
        
        Returns:
            Generated message text
        """
        username = lead_info.get('username', 'there')
        original_message = lead_info.get('message', '')
        reasoning = lead_info.get('reasoning', '')
        
        system_prompt = f"""
{self.communication_prompt}

Контекст лида:
- Username: @{username}
- Исходное сообщение лида: "{original_message[:500]}"
- Почему мы считаем его лидом: {reasoning}

Задача: Напиши ПЕРВОЕ сообщение для начала диалога с этим человеком.

Требования:
1. Будь естественным и человечным
2. Не пиши слишком длинно (2-3 предложения максимум)
3. Покажи что ты читал его сообщение
4. Предложи помощь или начни диалог ненавязчиво
5. НЕ упоминай что ты AI или бот
6. Пиши на том же языке что и исходное сообщение
7. ОБЯЗАТЕЛЬНО выведи готовый текст сообщения в ответе, не только в размышлениях

Напиши только текст сообщения, без дополнительных пояснений.
"""
        
        try:
            message = await self._call_ai(system_prompt, [])
            print(f"🤖 Generated first message for @{username}")
            return message.strip()
        except Exception as e:
            print(f"❌ Error generating first message: {e}")
            # Fallback message
            return f"Привет! Увидел ваше сообщение и подумал что могу помочь. Интересно обсудить?"
    
    async def generate_response(
        self, 
        conversation_history: List[Dict], 
        new_message: str
    ) -> Tuple[str, bool]:
        """
        Generate response to lead's message
        
        Args:
            conversation_history: List of previous messages
            new_message: New message from lead
        
        Returns:
            Tuple of (response_text, is_hot_lead)
        """
        system_prompt = f"""
{self.communication_prompt}

КРИТЕРИИ ГОРЯЧЕГО ЛИДА:
{self.hot_lead_criteria}

Твоя задача:
1. Веди естественный диалог
2. Отвечай коротко и по делу (2-4 предложения)
3. Задавай уточняющие вопросы если нужно
4. Если лид показывает явный интерес и соответствует критериям горячего лида - добавь в САМОМ КОНЦЕ своего ответа маркер: [HOT_LEAD]
5. ОБЯЗАТЕЛЬНО выведи готовый текст ответа в сообщении, не только в размышлениях

ВАЖНО:
- Маркер [HOT_LEAD] добавляй ТОЛЬКО если лид действительно соответствует всем критериям
- Маркер должен быть в самом конце, он будет удален перед отправкой
- НЕ упоминай что ты AI или бот
- Будь человечным и естественным

Ответь на последнее сообщение лида.
"""
        
        # Build conversation history for AI
        ai_history = []
        for msg in conversation_history:
            ai_history.append({
                'role': msg['role'],
                'content': msg['content']
            })
        
        # Add new message
        ai_history.append({
            'role': 'user',
            'content': new_message
        })
        
        try:
            response = await self._call_ai(system_prompt, ai_history)
            
            # Check for hot lead marker
            is_hot_lead = '[HOT_LEAD]' in response
            
            # Remove marker from response
            clean_response = response.replace('[HOT_LEAD]', '').strip()
            
            if is_hot_lead:
                print(f"🔥 HOT LEAD DETECTED!")
            
            return (clean_response, is_hot_lead)
            
        except Exception as e:
            print(f"❌ Error generating response: {e}")
            # Fallback response
            return ("Спасибо за ответ! Дайте мне немного времени, я уточню детали.", False)
    
    async def generate_lead_summary(self, lead_info: Dict, conversation_history: List[Dict]) -> str:
        """
        Generate a summary of why this lead is relevant
        
        Args:
            lead_info: Lead details including original message
            conversation_history: Dialogue history
            
        Returns:
            Summary text
        """
        username = lead_info.get('username', 'Unknown')
        original_message = lead_info.get('original_message', {}).get('message', '')
        
        # Format conversation for prompt
        dialogue_text = ""
        for msg in conversation_history:
            role = "Assistant" if msg['role'] == 'assistant' else "User"
            dialogue_text += f"{role}: {msg['content']}\n"
            
        system_prompt = f"""
Ты - аналитик лидов. Твоя задача - объяснить, почему этот пользователь является "Горячим лидом" и что он ищет.

Данные лида:
Username: @{username}
Изначальное сообщение (где мы его нашли): "{original_message}"

Переписка с ботом:
{dialogue_text}

Напиши КРАТКОЕ резюме (3-5 предложений):
1. Кого или что искал лид изначально?
2. Почему он нам подходит (почему мы считаем его горячим)?
3. О чем договорились в переписке (если есть договоренности)?

Отвечай на русском языке, четко и по делу. Не используй маркеры форматирования (типа **bold**), просто текст.
"""
        
        try:
            summary = await self._call_ai(system_prompt, [])
            return summary.strip()
        except Exception as e:
            print(f"❌ Error generating lead summary: {e}")
            return f"Лид проявил интерес в ходе переписки. Изначально искал: {original_message[:50]}..."

    
    async def _call_ai(self, system_prompt: str, conversation_history: List[Dict]) -> str:
        """
        Call OpenRouter API with Gemini 3 Pro Preview using user's API key
        
        Args:
            system_prompt: System instructions
            conversation_history: Previous messages
        
        Returns:
            AI's response text
        """
        if not self.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured for this user")
        
        url = os.getenv('OPENROUTER_BASE_URL', 'https://router.requesty.ai/v1') + '/chat/completions'
        
        messages = [{'role': 'system', 'content': system_prompt}]
        messages.extend(conversation_history)
        
        headers = {
            'Authorization': f'Bearer {self.openrouter_api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/your-repo',
            'X-Title': 'AI Lead Messenger'
        }
        
        payload = {
            'model': AI_MODEL,
            'messages': messages,
            'temperature': 0.7,
            'max_tokens': 4000
        }
        
        with trace_llm_call("ai_communicator", AI_MODEL, system_prompt) as set_output:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        response_text = data['choices'][0]['message']['content']
                        cleaned_response = self._filter_reasoning(response_text)
                        
                        usage = data.get('usage', {})
                        set_output(
                            output=cleaned_response,
                            token_total=usage.get('total_tokens', 0)
                        )
                        
                        if len(cleaned_response) < len(response_text):
                            print(f"⚠️ Filtered out {len(response_text) - len(cleaned_response)} chars of reasoning")
                        
                        return cleaned_response
                    else:
                        error_text = await resp.text()
                        set_output(error=f"HTTP {resp.status}: {error_text[:200]}")
                        raise Exception(f"OpenRouter API error {resp.status}: {error_text}")

