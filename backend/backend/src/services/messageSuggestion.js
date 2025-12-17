import { getOpenRouter } from '../config/openrouter.js';
import { estimateTokens, calculateCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { AIServiceError, retryWithBackoff } from '../utils/errorHandler.js';

/**
 * Filter out reasoning/thinking patterns from AI response
 * Gemini models (especially 3 Pro) might include internal reasoning
 * @param {string} response - Raw AI response
 * @returns {string} Cleaned response without reasoning artifacts
 */
const filterReasoning = (response) => {
  if (!response) return response;
  
  // Common reasoning patterns to remove
  const reasoningPatterns = [
    /Thinking:.*?(?=\n\n|\n[A-ZА-Я]|\Z)/gis,     // "Thinking: ..."
    /Reasoning:.*?(?=\n\n|\n[A-ZА-Я]|\Z)/gis,    // "Reasoning: ..."
    /Let me think.*?(?=\n\n|\n[A-ZА-Я]|\Z)/gis,  // "Let me think..."
    /Analysis:.*?(?=\n\n|\n[A-ZА-Я]|\Z)/gis,     // "Analysis: ..."
    /\[REASONING\].*?\[\/REASONING\]/gis,         // [REASONING]...[/REASONING]
    /<thinking>.*?<\/thinking>/gis,              // <thinking>...</thinking>
  ];
  
  let cleaned = response;
  for (const pattern of reasoningPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned.trim();
};

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
- Ответ должен быть готовым шаблоном сообщения
- ОБЯЗАТЕЛЬНО выведи готовый текст подсказки в ответе, не только в размышлениях`;

    // Auto-replace placeholders in user prompt
    const processedPrompt = messagePrompt
      .replace(/\[название чата\]/gi, lead.chat_name || 'этом чате')
      .replace(/\[чат\]/gi, lead.chat_name || 'чате')
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
    // Use Gemini 3 Pro for high-quality suggestions
    // With increased max_tokens (2500) to allow room for reasoning + content and reasoning filter, it works reliably
    const model = process.env.MESSAGE_SUGGESTION_MODEL || 'google/gemini-3-pro-preview';

    logger.info('🚀 Starting OpenRouter API call for suggestion', {
      leadId: lead.id,
      model,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      temperature: 0.7,
      max_tokens: 2500
    });

    // Make API call
    let response;
    try {
      response = await retryWithBackoff(async () => {
        logger.info('⏳ Calling OpenRouter API...', { leadId: lead.id, model });
        const apiResponse = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7, // More creative for message generation
          max_tokens: 2500 // Further increased - Gemini 3 Pro uses lots of reasoning tokens
          // NOTE: No provider filtering for Gemini models - they're only available via Google
        });
        logger.info('✅ OpenRouter API call completed', { 
          leadId: lead.id, 
          hasResponse: !!apiResponse,
          responseKeys: apiResponse ? Object.keys(apiResponse) : []
        });
        return apiResponse;
      }, 3, 1000);
    } catch (apiError) {
      logger.error('❌ OpenRouter API call failed', {
        leadId: lead.id,
        error: apiError.message,
        stack: apiError.stack,
        name: apiError.name
      });
      throw apiError;
    }

    const duration = Date.now() - startTime;

    // Log full response for debugging
    logger.info('OpenRouter API response received', {
      leadId: lead.id,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length,
      hasMessage: !!response.choices?.[0]?.message,
      hasContent: !!response.choices?.[0]?.message?.content,
      contentLength: response.choices?.[0]?.message?.content?.length,
      contentPreview: response.choices?.[0]?.message?.content?.substring(0, 100),
      model: response.model,
      usage: response.usage
    });

    // Extract response
    const rawSuggestion = response.choices[0]?.message?.content;
    if (!rawSuggestion) {
      logger.error('Empty response from AI - full response', {
        leadId: lead.id,
        response: JSON.stringify(response, null, 2)
      });
      throw new AIServiceError('Empty response from AI');
    }

    // Filter out reasoning/thinking patterns
    const suggestion = filterReasoning(rawSuggestion);
    
    // Log if reasoning was filtered out
    if (suggestion.length < rawSuggestion.length) {
      logger.info('Filtered reasoning from suggestion', {
        leadId: lead.id,
        originalLength: rawSuggestion.length,
        cleanedLength: suggestion.length,
        filtered: rawSuggestion.length - suggestion.length
      });
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

