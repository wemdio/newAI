import { getOpenRouter } from '../config/openrouter.js';
import { estimateTokens, calculateCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { AIServiceError, retryWithBackoff } from '../utils/errorHandler.js';

/**
 * Generate sales message suggestion for a lead
 * @param {object} lead - Lead message data
 * @param {object} analysis - AI analysis result
 * @param {string} messagePrompt - User's prompt for message generation
 * @param {string} apiKey - OpenRouter API key
 * @returns {object} Generated suggestion
 */
export const generateMessageSuggestion = async (lead, analysis, messagePrompt, apiKey) => {
  const startTime = Date.now();
  
  try {
    // Build prompt for message generation
    const systemPrompt = `Ты помощник sales менеджера. Твоя задача - сгенерировать подсказку для первого сообщения потенциальному клиенту (лиду).

ВАЖНО:
- Пиши на русском языке
- Будь конкретным и персонализированным
- Используй информацию о лиде
- Следуй инструкциям пользователя
- Ответ должен быть готовым шаблоном сообщения`;

    // Auto-replace placeholders in user prompt
    const processedPrompt = messagePrompt
      .replace(/\[название чата\]/gi, lead.chat_name || 'этом чате')
      .replace(/\[имя\]/gi, lead.first_name || 'друг')
      .replace(/\[username\]/gi, lead.username ? '@' + lead.username : 'вы');
    
    const userPrompt = `ИНСТРУКЦИИ ПОЛЬЗОВАТЕЛЯ:
${processedPrompt}

ИНФОРМАЦИЯ О ЛИДЕ:
Имя: ${lead.first_name || ''} ${lead.last_name || ''}
Username: ${lead.username ? '@' + lead.username : 'Скрыт'}
Био: ${lead.bio || 'Не указано'}
Канал: ${lead.chat_name || 'Не указан'}

СООБЩЕНИЕ ЛИДА:
${lead.message}

АНАЛИЗ AI:
Уверенность: ${analysis.confidence_score}%
Обоснование: ${analysis.reasoning}
Совпадения: ${analysis.matched_criteria?.join(', ') || 'Нет'}

ЗАДАЧА: Сгенерируй короткую подсказку (2-3 предложения) для sales менеджера - какое первое сообщение написать этому лиду. Используй инструкции пользователя выше.`;

    // Estimate cost
    const inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    const estimatedOutputTokens = 150; // Short suggestion

    logger.debug('Generating message suggestion', {
      leadId: lead.id,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens
    });

    // Get OpenRouter client
    const client = getOpenRouter(apiKey);
    const model = process.env.AI_MODEL || 'google/gemini-2.0-flash-001';

    // Make API call
    const response = await retryWithBackoff(async () => {
      return await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7, // More creative for message generation
        max_tokens: 300
      });
    }, 3, 1000);

    const duration = Date.now() - startTime;

    // Extract response
    const suggestion = response.choices[0]?.message?.content;
    if (!suggestion) {
      throw new AIServiceError('Empty response from AI');
    }

    // Calculate actual cost
    const actualInputTokens = response.usage?.prompt_tokens || inputTokens;
    const actualOutputTokens = response.usage?.completion_tokens || estimatedOutputTokens;
    const cost = calculateCost(actualInputTokens, actualOutputTokens);

    logger.info('Message suggestion generated', {
      leadId: lead.id,
      duration,
      cost: cost.totalCost
    });

    return {
      success: true,
      suggestion: suggestion.trim(),
      metadata: {
        model,
        duration,
        cost: cost.totalCost,
        tokens: {
          input: actualInputTokens,
          output: actualOutputTokens,
          total: actualInputTokens + actualOutputTokens
        }
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Failed to generate message suggestion', {
      leadId: lead.id,
      error: error.message,
      duration
    });

    throw new AIServiceError('Failed to generate message suggestion', {
      leadId: lead.id,
      originalError: error.message,
      duration
    });
  }
};

export default {
  generateMessageSuggestion
};

