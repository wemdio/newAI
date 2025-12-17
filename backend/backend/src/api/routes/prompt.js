import express from 'express';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * Generate prompt from brief
 * POST /api/prompt/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { brief } = req.body;

    if (!brief) {
      return res.status(400).json({
        success: false,
        error: 'Brief data is required'
      });
    }

    logger.info('Generating prompt from brief', {
      companyName: brief.companyName,
      industry: brief.industry
    });

    // Generate prompt based on brief
    const prompt = generatePromptFromBrief(brief);
    const explanation = generateExplanation(brief);

    res.json({
      success: true,
      prompt,
      explanation
    });

  } catch (error) {
    logger.error('Failed to generate prompt', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Improve existing prompt with AI
 * POST /api/prompt/improve
 */
router.post('/improve', async (req, res) => {
  try {
    const { currentPrompt, foundLeads, feedback, apiKey } = req.body;

    if (!currentPrompt) {
      return res.status(400).json({
        success: false,
        error: 'Current prompt is required'
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    logger.info('Improving prompt with AI');

    // Call AI to analyze and improve prompt
    const result = await improvePromptWithAI(currentPrompt, foundLeads, feedback, apiKey);

    res.json({
      success: true,
      improvedPrompt: result.improvedPrompt,
      changes: result.changes,
      analysis: result.analysis
    });

  } catch (error) {
    logger.error('Failed to improve prompt', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate prompt from brief data
 */
function generatePromptFromBrief(brief) {
  const {
    companyName,
    industry,
    services,
    notServices,
    restrictions,
    targetAudience,
    decisionMaker,
    notClient,
    painPoints,
    triggerEvents,
    clientPhrases,
    industryTerms,
    simpleTerms,
    positiveMarkers,
    negativeMarkers,
    competitors,
    confusedServices,
    idealLeadExamples,
    notLeadExamples,
    additionalNotes
  } = brief;

  // Build keywords section
  let keywords = [];
  
  if (industryTerms) {
    keywords.push(...industryTerms.split(/[,\n]/).map(k => k.trim()).filter(Boolean));
  }
  if (simpleTerms) {
    keywords.push(...simpleTerms.split(/[,\n]/).map(k => k.trim()).filter(Boolean));
  }
  
  // Extract keywords from services
  if (services) {
    const serviceWords = services.match(/[а-яёa-z]{4,}/gi) || [];
    keywords.push(...serviceWords.slice(0, 20));
  }

  // Extract from pain points
  if (painPoints) {
    const painWords = painPoints.match(/[а-яёa-z]{4,}/gi) || [];
    keywords.push(...painWords.slice(0, 15));
  }

  // Deduplicate keywords
  keywords = [...new Set(keywords.map(k => k.toLowerCase()))];

  // Build stop factors
  let stopFactors = [];
  
  if (notServices) {
    stopFactors.push(`ИСКЛЮЧЁННЫЕ УСЛУГИ:\n${notServices}`);
  }
  
  if (notClient) {
    stopFactors.push(`НЕ ЦЕЛЕВЫЕ КЛИЕНТЫ:\n${notClient}`);
  }
  
  if (restrictions) {
    stopFactors.push(`ОГРАНИЧЕНИЯ:\n${restrictions}`);
  }
  
  if (negativeMarkers) {
    stopFactors.push(`СТОП-СЛОВА: ${negativeMarkers}`);
  }
  
  if (confusedServices) {
    stopFactors.push(`СМЕЖНЫЕ НИШИ (не наше):\n${confusedServices}`);
  }

  // Build the prompt
  let prompt = `КЛЮЧЕВЫЕ СЛОВА:

${keywords.join(', ')}

ЦЕЛЕВОЙ ЛИД:

Человек или компания, которые АКТИВНО ИЩУТ:
${services ? services.split('\n').map(s => `- ${s.trim()}`).filter(s => s.length > 2).join('\n') : '- [Опишите услуги в брифе]'}

${targetAudience ? `ЦЕЛЕВАЯ АУДИТОРИЯ:\n${targetAudience}\n` : ''}
${decisionMaker ? `ЛПР (лицо, принимающее решение): ${decisionMaker}\n` : ''}

${painPoints ? `БОЛИ КЛИЕНТОВ:\n${painPoints.split('\n').map(p => `- ${p.trim()}`).filter(p => p.length > 2).join('\n')}\n` : ''}

${triggerEvents ? `ТРИГГЕРНЫЕ СОБЫТИЯ:\n${triggerEvents}\n` : ''}

${clientPhrases ? `ПРИМЕРЫ ФРАЗ КЛИЕНТОВ:\n${clientPhrases}\n` : ''}

ОЦЕНКА УВЕРЕННОСТИ:

Score 85-100 — горячий лид:
- Прямой запрос: ${positiveMarkers || 'ищу, нужно, требуется, посоветуйте, подскажите, где найти, кто может'}
- Человек активно ищет решение прямо сейчас

Score 70-84 — тёплый лид:
- Описывает проблему и интересуется решением
- Явная потребность, но без прямого запроса

Score 0-69 — не лид:
- Уже нашёл решение или ведёт переговоры
- Просто обсуждает тему без активного поиска
- Нет явной потребности в услуге

🛑 СТОП-ФАКТОРЫ:

УЖЕ РЕШИЛИ ВОПРОС:
уже работаем, ведём переговоры, нашли, выбрали, договорились

ВАКАНСИИ И НАЙМ:
зарплата, ЗП, оклад, график, в штат, по ТК, ищем сотрудника, вакансия, резюме

${stopFactors.join('\n\n')}

МУСОР:
предлагаю услуги, наша команда, кейс, реклама
информационные посты без запроса, боты, спам

${notLeadExamples ? `\nПРИМЕРЫ НЕЦЕЛЕВЫХ ОБРАЩЕНИЙ:\n${notLeadExamples}\n` : ''}

${additionalNotes ? `ДОПОЛНИТЕЛЬНО:\n${additionalNotes}\n` : ''}
НЕ ДОДУМЫВАЙ! Если связь с услугами неочевидна → is_match: false`;

  return prompt.trim();
}

/**
 * Generate explanation for the generated prompt
 */
function generateExplanation(brief) {
  let explanation = `Промпт сгенерирован на основе брифа.\n\n`;
  
  explanation += `📌 СТРУКТУРА ПРОМПТА:\n\n`;
  explanation += `1. КЛЮЧЕВЫЕ СЛОВА — для пре-фильтра (отсеивает ~70% нерелевантных сообщений до AI)\n`;
  explanation += `2. ЦЕЛЕВОЙ ЛИД — описание идеального клиента для AI\n`;
  explanation += `3. ОЦЕНКА УВЕРЕННОСТИ — как AI должен ставить score\n`;
  explanation += `4. СТОП-ФАКТОРЫ — после маркера 🛑 (не попадают в ключевые слова)\n\n`;
  
  explanation += `💡 РЕКОМЕНДАЦИИ:\n\n`;
  explanation += `• Проверьте ключевые слова — добавьте склонения и синонимы\n`;
  explanation += `• Убедитесь, что стоп-факторы не содержат целевых слов\n`;
  explanation += `• Запустите тестовый аудит на 1-2 дня и проанализируйте результаты\n`;
  explanation += `• При необходимости используйте режим "Улучшить промпт"\n`;
  
  return explanation;
}

/**
 * Improve prompt using AI
 */
async function improvePromptWithAI(currentPrompt, foundLeads, feedback, apiKey) {
  const systemPrompt = `Ты — эксперт по созданию промптов для системы поиска лидов в Telegram.

КОНТЕКСТ СИСТЕМЫ:
1. Пре-фильтр извлекает ключевые слова из промпта и ищет их в сообщениях
2. Всё после маркера "🛑 СТОП-ФАКТОРЫ" отрезается от ключевых слов
3. AI анализирует сообщения и ставит is_match: true/false и confidence_score 0-100
4. Лид сохраняется если is_match: true И confidence_score >= 70

ТВОЯ ЗАДАЧА:
1. Проанализировать текущий промпт на технические ошибки
2. Проанализировать найденные лиды (если есть) — какие хорошие, какие плохие
3. Учесть обратную связь пользователя
4. Предложить улучшенный промпт

ТИПИЧНЫЕ ОШИБКИ:
- Целевые слова в стоп-факторах (загрязняют ключевые слова)
- Примеры с полными фразами вместо маркеров
- Нет склонений ключевых слов
- Слишком широкие критерии (AI додумывает)
- Нет чёткого разделения "ищет" vs "предлагает"

ФОРМАТ ОТВЕТА (JSON):
{
  "analysis": "Анализ текущего промпта и найденных лидов",
  "changes": "Список внесённых изменений",
  "improvedPrompt": "Полный текст улучшенного промпта"
}`;

  const userMessage = `ТЕКУЩИЙ ПРОМПТ:
${currentPrompt}

${foundLeads ? `НАЙДЕННЫЕ ЛИДЫ:\n${foundLeads}\n` : ''}
${feedback ? `ОБРАТНАЯ СВЯЗЬ:\n${feedback}\n` : ''}

Проанализируй и улучши промпт.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://telegram-scanner.ru',
        'X-Title': 'Prompt Builder'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        // Provider filtering - use only specified providers
        provider: {
          order: ['DeepInfra', 'Novita', 'GMICloud', 'Ncompass', 'SiliconFlow'],
          allow_fallbacks: false,
          quantizations: ['fp4', 'fp8']
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'OpenRouter API error');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // If JSON parsing fails, return the raw content
      logger.warn('Failed to parse AI response as JSON', { parseError: parseError.message });
      result = {
        analysis: 'Не удалось распарсить ответ AI',
        changes: 'См. улучшенный промпт ниже',
        improvedPrompt: content
      };
    }

    return result;

  } catch (error) {
    logger.error('OpenRouter API call failed', { error: error.message });
    throw error;
  }
}

export default router;

