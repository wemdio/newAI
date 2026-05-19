import { getOpenRouter } from '../config/openrouter.js';
import { buildSystemPromptWithCriteria, buildUserPromptForMessage, detectLeadMode } from '../prompts/promptBuilder.js';
import { validateAIResponse, logValidationResult } from '../validators/aiResponseValidator.js';
import { estimateTokens, calculateCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { AIServiceError, retryWithBackoff } from '../utils/errorHandler.js';
import PQueue from 'p-queue';

/**
 * Normalize common model output inconsistencies.
 * Some models return booleans/numbers as strings, use different key names
 * (confidence vs confidence_score), or return confidence as 0..1.
 * We coerce safely to avoid false positives and reduce validation failures.
 */
const normalizeBatchAIResult = (aiResult, expectedMessageId) => {
  let normalized = { ...(aiResult || {}) };

  // Some models wrap the actual payload
  if (normalized.result && typeof normalized.result === 'object') {
    normalized = { ...normalized, ...normalized.result };
  }
  if (normalized.data && typeof normalized.data === 'object') {
    normalized = { ...normalized, ...normalized.data };
  }

  // Key aliases
  if (normalized.is_match == null && normalized.isMatch != null) normalized.is_match = normalized.isMatch;
  if (normalized.is_match == null && normalized.match != null) normalized.is_match = normalized.match;
  if (normalized.is_match == null && normalized.is_lead != null) normalized.is_match = normalized.is_lead;

  if (normalized.confidence_score == null && normalized.confidence != null) normalized.confidence_score = normalized.confidence;
  if (normalized.confidence_score == null && normalized.confidenceScore != null) normalized.confidence_score = normalized.confidenceScore;
  if (normalized.confidence_score == null && normalized.confidence_percent != null) normalized.confidence_score = normalized.confidence_percent;

  if (normalized.reasoning == null && normalized.reason != null) normalized.reasoning = normalized.reason;
  if (normalized.reasoning == null && normalized.explanation != null) normalized.reasoning = normalized.explanation;
  if (normalized.reasoning == null && normalized.rationale != null) normalized.reasoning = normalized.rationale;

  if (normalized.matched_criteria == null && normalized.matchedCriteria != null) normalized.matched_criteria = normalized.matchedCriteria;
  if (normalized.matched_criteria == null && normalized.criteria != null) normalized.matched_criteria = normalized.criteria;
  if (normalized.matched_criteria == null && normalized.matched != null) normalized.matched_criteria = normalized.matched;

  // Ensure id is a string for stable comparisons/logs
  if (normalized.id != null) normalized.id = String(normalized.id);
  if (expectedMessageId != null && (!normalized.id || normalized.id.trim() === '')) {
    normalized.id = String(expectedMessageId);
  }

  // Coerce "true"/"false" strings to booleans
  if (typeof normalized.is_match === 'string') {
    const v = normalized.is_match.trim().toLowerCase();
    if (v === 'true') normalized.is_match = true;
    if (v === 'false') normalized.is_match = false;
  } else if (typeof normalized.is_match === 'number') {
    // Some models return 0/1
    normalized.is_match = normalized.is_match >= 1;
  }

  // Coerce numeric strings to numbers
  if (typeof normalized.confidence_score === 'string') {
    const n = Number(normalized.confidence_score);
    if (Number.isFinite(n)) normalized.confidence_score = n;
  }
  // Normalize 0..1 confidence to 0..100
  if (typeof normalized.confidence_score === 'number' && Number.isFinite(normalized.confidence_score)) {
    if (normalized.confidence_score > 0 && normalized.confidence_score <= 1) {
      normalized.confidence_score = Math.round(normalized.confidence_score * 100);
    }
    normalized.confidence_score = Math.max(0, Math.min(100, normalized.confidence_score));
  }

  // Normalize matched_criteria
  if (typeof normalized.matched_criteria === 'string') {
    const s = normalized.matched_criteria.trim();
    // Try parse JSON array-as-string first, otherwise wrap as single item
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const parsed = JSON.parse(s);
        normalized.matched_criteria = Array.isArray(parsed) ? parsed : (s ? [s] : []);
      } catch {
    normalized.matched_criteria = s ? [s] : [];
      }
    } else {
      normalized.matched_criteria = s ? [s] : [];
    }
  } else if (!Array.isArray(normalized.matched_criteria)) {
    normalized.matched_criteria = [];
  } else {
    normalized.matched_criteria = normalized.matched_criteria
      .map(x => (typeof x === 'string' ? x.trim() : (x == null ? '' : String(x).trim())))
      .filter(Boolean);
  }

  // Normalize reasoning
  if (typeof normalized.reasoning !== 'string') {
    normalized.reasoning = normalized.reasoning == null ? '' : String(normalized.reasoning);
  }

  return normalized;
};

const getResponseMeta = (requestedModel, response) => ({
  requestedModel,
  resolvedModel: response?.model || null,
  usage: response?.usage || null,
  finishReason: response?.choices?.[0]?.finish_reason || null
});

export const buildLeadAnalysisCompletionParams = ({
  model,
  messages,
  response_format,
  max_tokens,
  ...rest
}) => ({
  model,
  messages,
  ...rest,
  reasoning_effort: 'none',
  ...(response_format ? { response_format } : {}),
  max_tokens
});

/**
 * Core AI message analysis service
 * Handles communication with OpenRouter and validation
 */

/**
 * Double check a potential lead with a stronger model (Gemini 3 Pro)
 * @param {object} message - Original message
 * @param {object} initialAnalysis - Result from first analysis
 * @param {string} userCriteria - User criteria
 * @param {string} apiKey - OpenRouter API key
 * @returns {object} Verification result
 */
export const doubleCheckLead = async (message, initialAnalysis, userCriteria, apiKey) => {
  const startTime = Date.now();
  const model = process.env.DOUBLE_CHECK_MODEL || 'policy/lead-doublecheck';

  try {
    logger.info('Starting Double Check with AI', {
      messageId: message.id,
      initialConfidence: initialAnalysis.confidence_score,
      initialReasoning: initialAnalysis.reasoning,
      model
    });

    const client = getOpenRouter(apiKey);

    // Mode-aware verification: 'offer' clients (marker [LEAD_MODE: OFFER]) must not
    // have ads/offers rejected by the hardcoded verifier rules. Default unchanged.
    const verificationRules = detectLeadMode(userCriteria) === 'offer'
      ? `ПРАВИЛА ВЕРИФИКАЦИИ (РЕЖИМ ОФФЕР):
- Лид = сообщение подходит под секцию "КОГО ИЩЕМ" критериев. Это МОЖЕТ быть объявление о продаже или сдаче в аренду объекта.
- НЕ лид = сообщение попадает под стоп-факторы пользователя: реклама чужих услуг/сервиса, не та тема, не тот тип объекта, спам, вакансия.
- Если сообщение ПОХОЖЕ на лид (даже частично) — верифицируй как true. Сомнения в пользу лида.
- Отвергай ТОЛЬКО если сообщение явно НЕ подходит под критерии.`
      : `ПРАВИЛА ВЕРИФИКАЦИИ:
- Лид = человек ИЩЕТ услугу, ОПИСЫВАЕТ ПРОБЛЕМУ или ЗАДАЁТ ВОПРОС по теме критериев
- НЕ лид = человек ПРЕДЛАГАЕТ свои услуги, рекламирует, ищет сотрудников
- Если сообщение ПОХОЖЕ на лид (даже частично) — верифицируй как true. Сомнения в пользу лида.
- Отвергай ТОЛЬКО если это явно НЕ лид (реклама, оффер, спам, не та тема)`;

    const systemContent = `Ты — верификатор лидов. Первичный AI уже нашёл потенциальный лид. Твоя задача — проверить, не ошибся ли он.

КРИТЕРИИ ПОИСКА ПОЛЬЗОВАТЕЛЯ:
${userCriteria}

${verificationRules}

Отвечай СТРОГО JSON: {"verified": true} или {"verified": false, "reason": "кратко почему"}`;

    const userContent = `ПЕРВИЧНЫЙ AI НАШЁЛ ЛИД (confidence: ${initialAnalysis.confidence_score}%):
Причина: "${initialAnalysis.reasoning || 'не указана'}"

СООБЩЕНИЕ:
"${(message.message || '').substring(0, 800)}"
${message.chat_name ? `Канал: ${message.chat_name}` : ''}
${message.bio ? `БИО автора: ${message.bio.substring(0, 200)}` : ''}

Верифицируй: это действительно лид по указанным критериям?`;

    const response = await retryWithBackoff(async () => {
      try {
        return await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 2000
        });
      } catch (e) {
        if (e.status === 403 || (e.response && e.response.status === 403)) {
           logger.error(`Model ${model} returned 403 Forbidden`, { error: e.message });
           throw new Error(`Model ${model} is restricted (403)`);
        }
        throw e;
      }
    }, 3, 1000);

    const content = response.choices[0]?.message?.content;

    logger.info('Gemini Double Check response metadata', {
      messageId: message.id,
      ...getResponseMeta(model, response)
    });

    logger.info('Gemini Double Check raw response', {
      messageId: message.id,
      content: content ? content.substring(0, 300) : 'EMPTY',
      finishReason: response.choices[0]?.finish_reason
    });
    
    if (!content || content.trim() === '') {
      logger.error('Received empty response from Double Check AI', {
        model,
        finishReason: response.choices[0]?.finish_reason
      });
      throw new Error('Empty response from Double Check AI');
    }

    let result;
    try {
      let cleanContent = content.trim()
        .replace(/```json\n?|\n?```/g, '')
        .trim();
      
      const jsonMatch = cleanContent.match(/\{[^}]*verified[^}]*\}/i);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      let parsed;
      try {
        parsed = JSON.parse(cleanContent);
      } catch {
        const hasTrue = /verified["']?\s*:\s*true/i.test(cleanContent);
        const hasFalse = /verified["']?\s*:\s*false/i.test(cleanContent);
        
        if (hasTrue || hasFalse) {
          parsed = { verified: hasTrue && !hasFalse };
        } else {
          throw new Error('Could not determine verified status');
        }
      }
      
      const verified = parsed.verified === true;
      result = {
        verified,
        reasoning: parsed.reason || parsed.reasoning || (verified ? 'Verified by Gemini' : 'Rejected by Gemini'),
        confidence: verified ? initialAnalysis.confidence_score : 0
      };
      
    } catch (e) {
      logger.warn('Failed to parse Gemini response', { 
        content: content.substring(0, 300),
        error: e.message 
      });
      throw e;
    }

    const duration = Date.now() - startTime;

    if (!result.verified) {
      logger.info('Lead rejected by Gemini Double Check', {
        userId: 'see-caller',
        messageId: message.id,
        reason: result.reasoning,
        geminiRaw: content.substring(0, 200)
      });
    }
    
    logger.info('Gemini Double Check complete', {
        messageId: message.id,
        ...getResponseMeta(model, response),
        verified: result.verified,
        reason: result.reasoning,
        duration
    });

    return result;

  } catch (error) {
    logger.error('Double check failed', { error: error.message, messageId: message.id });
    // FAIL OPEN: if double-check itself fails, trust the initial DeepSeek analysis.
    // DeepSeek already validated with confidence >= 70. Network/API failures
    // should not silently kill all leads.
    return { 
      verified: true, 
      reasoning: "Double check unavailable - trusting initial analysis", 
      confidence: initialAnalysis.confidence_score 
    }; 
  }
};

/**
 * Analyze a single message with AI
 * @param {object} message - Message data from database
 * @param {string} userCriteria - User-defined lead criteria
 * @param {string} apiKey - OpenRouter API key
 * @returns {object} Analysis result
 */
export const analyzeMessage = async (message, userCriteria, apiKey) => {
  const startTime = Date.now();
  
  try {
    // Build prompts — criteria go into system message for DeepSeek automatic prefix caching
    // System prompt = SYSTEM_PROMPT + user criteria (STABLE prefix, cached across calls)
    // User prompt = only message data (VARIABLE part, changes each call)
    const systemPrompt = buildSystemPromptWithCriteria(userCriteria);
    const userPrompt = buildUserPromptForMessage(message, userCriteria);
    
    // Estimate cost before making call
    const inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    const estimatedOutputTokens = 200; // JSON response is typically ~150-200 tokens
    
    logger.debug('Starting AI analysis', {
      messageId: message.id,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens
    });
    
    // Get OpenRouter client and model
    const client = getOpenRouter(apiKey);
    // Use configured model or fallback to OpenAI gpt-oss-120b (open-weight MoE model)
    const model = process.env.AI_MODEL || 'qwen/qwen-2.5-72b-instruct';
    
    logger.info('Making OpenRouter API call', {
      messageId: message.id,
      model,
      hasClient: !!client
    });
    
    // Make API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat.completions.create(buildLeadAnalysisCompletionParams({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0, // Zero temperature for deterministic results
        top_p: 1, // Disable nucleus sampling for consistency
        seed: 12345, // Fixed seed for reproducibility
        response_format: { type: 'json_object' },
        max_tokens: 1000 // Enough room for compact JSON output
      }));
    }, 3, 1000);
    
    const duration = Date.now() - startTime;

    logger.info('OpenRouter AI response metadata', {
      messageId: message.id,
      ...getResponseMeta(model, response)
    });
    
    // Extract response content
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIServiceError('Empty response from AI');
    }
    
    // Strip markdown code blocks (some models wrap JSON in ```json ... ```)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      logger.debug('Stripped markdown json block from response', { messageId: message.id });
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      logger.debug('Stripped markdown code block from response', { messageId: message.id });
    }
    
    // If still not valid JSON, try to find JSON object in text
    if (!cleanContent.startsWith('{') && !cleanContent.startsWith('[')) {
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
        logger.debug('Extracted JSON from text response', { messageId: message.id });
      }
    }
    
    // Parse JSON response
    let aiResponse;
    try {
      aiResponse = JSON.parse(cleanContent);
    } catch (parseError) {
      logger.error('Failed to parse AI response as JSON', {
        messageId: message.id,
        content,
        error: parseError.message
      });
      throw new AIServiceError('Invalid JSON response from AI', {
        content,
        parseError: parseError.message
      });
    }

    // Normalize model output to expected schema before validation
    aiResponse = normalizeBatchAIResult(aiResponse, message.id?.toString?.() ?? message.id);
    
    // Calculate actual cost
    const actualInputTokens = response.usage?.prompt_tokens || inputTokens;
    const actualOutputTokens = response.usage?.completion_tokens || estimatedOutputTokens;
    const cost = calculateCost(actualInputTokens, actualOutputTokens);
    
    // SIMPLIFIED VALIDATION: Only check basic structure and confidence
    const validation = validateAIResponse(aiResponse, message);
    logValidationResult(validation, message);
    
    // Simple validation: trust AI if confidence >= 70 (practical threshold)
    const isValidMatch = 
      validation.valid && 
      aiResponse.is_match &&
      aiResponse.confidence_score >= 70;
    
    // Prepare result
    const result = {
      success: true,
      isMatch: isValidMatch,
      aiResponse,
      validation,
      metadata: {
        messageId: message.id,
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
    
    // Log result
    logger.info('AI analysis complete (simplified)', {
      messageId: message.id,
      ...getResponseMeta(model, response),
      isMatch: isValidMatch,
      confidence: aiResponse.confidence_score,
      validationPassed: validation.valid,
      meetsThreshold: aiResponse.confidence_score >= 70,
      duration,
      cost: cost.totalCost
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // ENHANCED ERROR LOGGING
    const errorDetails = {
      messageId: message.id,
      message: error.message,
      code: error.status || error.code,
      type: error.type,
      headers: error.response?.headers, // Check for x-ratelimit-remaining
      data: error.response?.data || error.error, // OpenRouter detailed error
      duration
    };

    logger.error('AI analysis failed', errorDetails);
    
    throw new AIServiceError('Failed to analyze message', {
      messageId: message.id,
      originalError: error.message,
      details: errorDetails, // Pass details up
      duration
    });
  }
};

/**
 * Analyze a batch of messages in a SINGLE API call (cost optimization)
 * @param {array} messages - Array of messages (up to 5-10 recommended)
 * @param {string} userCriteria - User-defined criteria
 * @param {string} apiKey - OpenRouter API key
 * @returns {array} Array of analysis results (one per message)
 */
export const analyzeMessageBatch = async (messages, userCriteria, apiKey) => {
  const startTime = Date.now();
  const batchSize = messages.length;
  
  try {
    logger.info('Starting batch AI analysis (single API call)', {
      batchSize,
      messageIds: messages.map(m => m.id)
    });
    
    // Build batch prompt — criteria in system message for DeepSeek prefix caching
    // System prompt = SYSTEM_PROMPT + user criteria (STABLE prefix, cached across calls for same user)
    const systemPrompt = buildSystemPromptWithCriteria(userCriteria);
    
    // Cost optimization: omit empty optional fields (fewer prompt tokens, same semantics)
    const messagesArray = messages.map(msg => {
      const payload = {
        id: msg.id.toString(),
        message: msg.message || ''
      };
      if (msg.chat_name) payload.chat_name = msg.chat_name;
      if (msg.username) payload.username = msg.username;
      if (msg.bio) payload.bio = msg.bio;
      return payload;
    });
    
    // Mode-aware task block: 'offer' clients (marker [LEAD_MODE: OFFER] in criteria)
    // must NOT have offers/ads auto-rejected. Default 'request' behavior unchanged.
    const leadMode = detectLeadMode(userCriteria);
    const taskBlock = leadMode === 'offer'
      ? `ЗАДАЧА ДЛЯ КАЖДОГО СООБЩЕНИЯ (РЕЖИМ ОФФЕР):
1. Объявления о продаже/сдаче объекта и описания сделок ДОПУСТИМЫ — не отсеивай их автоматически.
   - Реклама посреднических услуг/сервиса по теме критериев -> сверься со стоп-факторами пользователя.
2. Проверь соответствие КРИТЕРИЯМ ПОИСКА (см. system message), особенно секции "КОГО ИЩЕМ" и "НЕ СЧИТАТЬ ЛИДОМ".`
      : `ЗАДАЧА ДЛЯ КАЖДОГО СООБЩЕНИЯ:
1. Определи тип: ПОИСК/ПРОБЛЕМА (REQUEST) или ПРЕДЛОЖЕНИЕ (OFFER)?
   - ПРЕДЛАГАЕТ услуги -> is_match: false
   - ИЩЕТ решение / описывает проблему -> переходи к шагу 2
2. Проверь соответствие КРИТЕРИЯМ ПОИСКА (см. system message).`;

    // User prompt — only messages and format (variable part, NO criteria here)
    const userPrompt = `ПРОАНАЛИЗИРУЙ СЛЕДУЮЩИЕ ${batchSize} СООБЩЕНИЙ:
${JSON.stringify(messagesArray)}

${taskBlock}

ВАЖНО:
1. Проанализируй КАЖДОЕ сообщение ОТДЕЛЬНО (не смешивай контекст!)
2. Верни ТОЛЬКО МАССИВ из ${batchSize} JSON объектов (без дополнительного текста!)
3. Порядок результатов должен соответствовать порядку сообщений
4. Каждый результат должен содержать: id, is_match, confidence_score, reasoning, matched_criteria
5. Reasoning (причина) должна быть ОЧЕНЬ КРАТКОЙ (макс. 10 слов), чтобы избежать ошибок JSON.

КРИТИЧЕСКИ ВАЖНО: Ответ должен начинаться с [ и заканчиваться ] - это должен быть чистый JSON массив!

ФОРМАТ ОТВЕТА (ТОЛЬКО ЭТОТ JSON МАССИВ, БЕЗ ТЕКСТА):
[
  {
    "id": "message_id_1",
    "is_match": boolean,
    "confidence_score": 0-100,
    "reasoning": "кратко 5-10 слов",
    "matched_criteria": ["критерий1", "критерий2"]
  },
  {
    "id": "message_id_2",
    "is_match": boolean,
    "confidence_score": 0-100,
    "reasoning": "кратко 5-10 слов",
    "matched_criteria": []
  }
  ... (всего ${batchSize} объектов)
]`;

    // Get OpenRouter client and model
    const client = getOpenRouter(apiKey);
    // Use configured model or fallback to OpenAI gpt-oss-120b (open-weight MoE model)
    const model = process.env.AI_MODEL || 'qwen/qwen-2.5-72b-instruct';
    
    // Estimate tokens
    const estimatedInputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    const estimatedOutputTokens = batchSize * 100; // ~100 tokens per result
    
    logger.info('Making batch OpenRouter API call', {
      batchSize,
      model,
      estimatedInputTokens,
      estimatedOutputTokens
    });
    
    const response = await retryWithBackoff(async () => {
      return await client.chat.completions.create(buildLeadAnalysisCompletionParams({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, 
        top_p: 0.95,
        frequency_penalty: 0.1, // Standard low penalty
        presence_penalty: 0, 
        seed: 12345,
        // Don't use response_format for arrays - Gemini returns plain JSON array
        max_tokens: 4000 // Enough room for batch JSON output
      }));
    }, 3, 1000);
    
    const duration = Date.now() - startTime;

    logger.info('Batch OpenRouter response metadata', {
      batchSize,
      messageIds: messages.map(m => m.id),
      ...getResponseMeta(model, response)
    });
    
    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIServiceError('Empty response from AI');
    }
    
    logger.info('Raw batch response received', {
      batchSize,
      ...getResponseMeta(model, response),
      contentLength: content.length,
      contentPreview: content.substring(0, 200)
    });
    
    // Strip markdown code blocks (Gemini wraps JSON in ```json ... ```)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      logger.info('Stripped markdown json block from response');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      logger.info('Stripped markdown code block from response');
    }
    
    let batchResults;
    try {
      // Try to fix common JSON issues before parsing
      let jsonToParse = cleanContent;
      
      // Attempt 1: Parse as-is
      let parsed;
      try {
        parsed = JSON.parse(jsonToParse);
      } catch (firstError) {
        logger.warn('First JSON parse attempt failed, trying to fix common issues', {
          error: firstError.message,
          contentPreview: jsonToParse.substring(0, 300)
        });
        
        // Attempt 2: Fix unterminated strings by finding last valid closing brace
        try {
          // Find the last occurrence of }] or } that might close our JSON
          const lastBraceIndex = Math.max(
            jsonToParse.lastIndexOf('}]'),
            jsonToParse.lastIndexOf('}')
          );
          
          if (lastBraceIndex > 0) {
            const truncated = jsonToParse.substring(0, lastBraceIndex + (jsonToParse[lastBraceIndex] === '}' && jsonToParse[lastBraceIndex + 1] === ']' ? 2 : 1));
            logger.info('Attempting to parse truncated JSON', {
              originalLength: jsonToParse.length,
              truncatedLength: truncated.length
            });
            parsed = JSON.parse(truncated);
            logger.info('Successfully parsed truncated JSON');
          } else {
            throw firstError; // Re-throw original error if we can't find a valid end
          }
        } catch (secondError) {
          // Attempt 3: Try to fix common escape issues
          try {
            const fixed = jsonToParse
              .replace(/[\u0000-\u001F]+/g, '') // Remove control characters
              .replace(/,(\s*[}\]])/g, '$1')     // Remove trailing commas
              .trim();
            parsed = JSON.parse(fixed);
            logger.info('Successfully parsed JSON after fixing escape sequences');
          } catch (thirdError) {
            logger.error('All JSON parse attempts failed', {
              firstError: firstError.message,
              secondError: secondError.message,
              thirdError: thirdError.message,
              contentLength: jsonToParse.length,
              contentStart: jsonToParse.substring(0, 100),
              contentEnd: jsonToParse.substring(Math.max(0, jsonToParse.length - 100))
            });
            throw firstError; // Throw the original error for clarity
          }
        }
      }
      
      logger.info('Parsed batch response structure', {
        batchSize,
        parsedType: typeof parsed,
        isArray: Array.isArray(parsed),
        keys: typeof parsed === 'object' ? Object.keys(parsed) : 'N/A'
      });
      
      // Handle different response formats
      if (Array.isArray(parsed)) {
        batchResults = parsed;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        batchResults = parsed.results;
      } else if (parsed.analyses && Array.isArray(parsed.analyses)) {
        batchResults = parsed.analyses;
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        batchResults = parsed.messages;
      } else {
        // Maybe it's a single-level object with numbered keys?
        const keys = Object.keys(parsed).filter(k => !isNaN(k)).sort((a, b) => a - b);
        if (keys.length > 0) {
          batchResults = keys.map(k => parsed[k]);
        } else {
          throw new AIServiceError(
            `Unexpected response format. Keys: ${Object.keys(parsed).join(', ')}`
          );
        }
      }
    } catch (parseError) {
      logger.error('Failed to parse batch response', {
        error: parseError.message,
        contentPreview: content.substring(0, 500)
      });
      throw new AIServiceError(`Failed to parse batch response: ${parseError.message}`);
    }
    
    if (!Array.isArray(batchResults)) {
      throw new AIServiceError(
        `batchResults is not an array. Type: ${typeof batchResults}`
      );
    }
    
    if (batchResults.length !== batchSize) {
      logger.warn('Batch size mismatch', {
        expected: batchSize,
        received: batchResults.length,
        results: batchResults
      });
      throw new AIServiceError(
        `Expected ${batchSize} results, got ${batchResults.length}`
      );
    }
    
    // Calculate cost
    const actualTokens = response.usage || {
      prompt_tokens: estimatedInputTokens,
      completion_tokens: estimatedOutputTokens,
      total_tokens: estimatedInputTokens + estimatedOutputTokens
    };
    // FIXED: calculateCost returns an object with totalCost property
    const costInfo = calculateCost(actualTokens.prompt_tokens, actualTokens.completion_tokens, model);
    const totalCost = costInfo.totalCost;
    const costPerMessage = totalCost / batchSize;
    
    // Process and validate each result
    const results = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const aiResultRaw = batchResults[i];
      
      // Check if result exists
      if (!aiResultRaw) {
        logger.error('Missing batch result', {
          messageId: message.id,
          position: i,
          totalResults: batchResults.length
        });
        throw new AIServiceError(`Missing result for message at position ${i}`);
      }

      const expectedId = message.id.toString();
      const aiResult = normalizeBatchAIResult(aiResultRaw, expectedId);
      
      // Validate result has correct ID
      const idMatch = String(aiResult.id) === expectedId;
      if (!idMatch) {
        logger.warn('Batch result ID mismatch', {
          expected: expectedId,
          received: aiResult.id,
          position: i
        });
      }
      
      // Validate AI response structure
      const validation = validateAIResponse(aiResult, message);
      logValidationResult(validation, message);
      
      // FIXED: validateAIResponse returns { valid, reason, validations }, NOT { isValid, data }!
      const result = {
        // CRITICAL: must be valid structure + correct id + boolean true
        // Avoid JS truthiness bug where "false" (string) is treated as true.
        isMatch: validation.valid && idMatch && aiResult.is_match === true && aiResult.confidence_score >= 70,
        aiResponse: aiResult,
        metadata: {
          duration: duration / batchSize, // Average duration per message
          cost: costPerMessage,
          tokens: {
            input: actualTokens.prompt_tokens / batchSize,
            output: actualTokens.completion_tokens / batchSize,
            total: actualTokens.total_tokens / batchSize
          },
          model,
          validationPassed: validation.valid
        }
      };
      
      // Log each result individually (same format as single message)
      logger.info('AI analysis complete (batch)', {
        messageId: message.id,
        isMatch: result.isMatch,
        confidence: result.aiResponse.confidence_score,
        validationPassed: validation.valid,
        meetsThreshold: result.aiResponse.confidence_score >= 70,
        duration: Math.round(duration / batchSize),
        cost: costPerMessage
      });
      
      results.push(result);
    }
    
    logger.info('Batch analysis complete', {
      batchSize,
      totalDuration: duration,
      totalCost: typeof totalCost === 'number' ? totalCost.toFixed(6) : '0.000000',
      avgCostPerMessage: typeof costPerMessage === 'number' ? costPerMessage.toFixed(6) : '0.000000',
      matches: results.filter(r => r.isMatch).length
    });
    
    return results;
    
  } catch (error) {
    // ENHANCED BATCH ERROR LOGGING
    const errorDetails = {
      batchSize,
      messageIds: messages.map(m => m.id),
      message: error.message,
      code: error.status || error.code,
      data: error.response?.data || error.error // Log OpenRouter details
    };

    logger.error('Batch AI analysis failed', errorDetails);

    const statusCode = error.status || error.code;
    if (statusCode === 429) {
      logger.warn('Rate limited (429) — skipping batch, will retry next cycle');
      throw error;
    }

    logger.warn('Falling back to individual analysis');
    const results = [];
    for (const message of messages) {
      try {
        const result = await analyzeMessage(message, userCriteria, apiKey);
        results.push(result);
      } catch (individualError) {
        logger.error('Individual analysis also failed', {
          messageId: message.id,
          error: individualError.message,
          data: individualError.details?.data
        });
        results.push(null);
      }
    }
    return results;
  }
};

/**
 * Analyze multiple messages in batch (with concurrent API calls)
 * @param {array} messages - Array of messages to analyze
 * @param {string} userCriteria - User-defined criteria
 * @param {string} apiKey - OpenRouter API key
 * @param {object} options - Batch options
 * @returns {object} Batch analysis results
 */
export const analyzeBatch = async (messages, userCriteria, apiKey, options = {}) => {
  const {
    maxConcurrent = 20, // Increased concurrency for faster processing
    stopOnError = false, // Whether to stop on first error
    useBatchApi = true, // Use batch API (5 messages per call)
    batchSize = 5 // Messages per API call
  } = options;
  
  const startTime = Date.now();
  
  logger.info('Starting batch analysis', {
    totalMessages: messages.length,
    useBatchApi,
    batchSize: useBatchApi ? batchSize : 'N/A',
    concurrency: maxConcurrent
  });
  
  const results = {
    analyzed: [],
    failed: [],
    matches: [],
    stats: {
      total: messages.length,
      analyzed: 0,
      failed: 0,
      matches: 0,
      totalCost: 0,
      totalTokens: 0,
      averageConfidence: 0
    }
  };

  // Initialize queue with concurrency limit
  const queue = new PQueue({ concurrency: maxConcurrent });
  
  if (useBatchApi) {
    // Process messages in chunks using batch API (5 messages per API call)
    // We create tasks for the queue
    const tasks = [];
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize);
      
      // Add task to queue
      tasks.push(async () => {
      try {
        // Single API call for all messages in chunk
        const chunkResults = await analyzeMessageBatch(chunk, userCriteria, apiKey);
        
        // Process results
        for (let j = 0; j < chunk.length; j++) {
          const message = chunk[j];
          const result = chunkResults[j];
          
          if (result) {
            results.analyzed.push(result);
            results.stats.analyzed++;
            results.stats.totalCost += result.metadata.cost;
            results.stats.totalTokens += result.metadata.tokens.total;
            
            if (result.isMatch) {
              results.matches.push({
                message,
                analysis: result
              });
              results.stats.matches++;
            }
          } else {
            results.failed.push({
              message,
              error: 'Null result from batch API'
            });
            results.stats.failed++;
          }
        }
      } catch (error) {
        logger.error('Batch API call failed for chunk', {
          chunkSize: chunk.length,
          error: error.message
        });
        
        // Mark all messages in chunk as failed
        for (const message of chunk) {
          results.failed.push({
            message,
            error: error.message
          });
          results.stats.failed++;
        }
        
        if (stopOnError) {
          throw error;
        }
      }
      });
    }

    // Execute all tasks via queue
    await queue.addAll(tasks);
    
  } else {
    // OLD: Process messages individually
    // Also using queue for consistency
    const tasks = messages.map(message => async () => {
        try {
          const result = await analyzeMessage(message, userCriteria, apiKey);
          
          results.analyzed.push(result);
          results.stats.analyzed++;
          results.stats.totalCost += result.metadata.cost;
          results.stats.totalTokens += result.metadata.tokens.total;
          
          if (result.isMatch) {
            results.matches.push({
              message,
              analysis: result
            });
            results.stats.matches++;
          }
          
          return result;
        } catch (error) {
          results.failed.push({
            message,
            error: error.message
          });
          results.stats.failed++;
          
          if (stopOnError) {
            throw error;
          }
          
          return null;
        }
      });
      
    await queue.addAll(tasks);
  }
  
  // Calculate average confidence for matches
  if (results.matches.length > 0) {
    const totalConfidence = results.matches.reduce(
      (sum, match) => sum + match.analysis.aiResponse.confidence_score,
      0
    );
    results.stats.averageConfidence = Math.round(totalConfidence / results.matches.length);
  }
  
  const duration = Date.now() - startTime;
  
  logger.info('Batch analysis complete', {
    total: results.stats.total,
    analyzed: results.stats.analyzed,
    failed: results.stats.failed,
    matches: results.stats.matches,
    totalCost: results.stats.totalCost.toFixed(6),
    duration,
    concurrency: maxConcurrent
  });
  
  return {
    ...results,
    duration
  };
};

/**
 * Test analysis with a sample message
 * Used for testing user criteria
 * @param {string} userCriteria - Criteria to test
 * @param {object} testMessage - Optional test message
 * @param {string} apiKey - OpenRouter API key
 * @returns {object} Test result
 */
export const testAnalysis = async (userCriteria, testMessage, apiKey) => {
  const defaultTestMessage = {
    id: 0,
    chat_name: 'Test Channel',
    first_name: 'John',
    last_name: 'Doe',
    username: 'johndoe',
    bio: 'Entrepreneur and business owner',
    message: 'Looking for a reliable marketing agency to help grow my e-commerce business. Budget is around $5k/month. Any recommendations?',
    message_time: new Date().toISOString()
  };
  
  const message = testMessage || defaultTestMessage;
  
  logger.info('Running test analysis', {
    hasCustomMessage: !!testMessage
  });
  
  try {
    const result = await analyzeMessage(message, userCriteria, apiKey);
    
    return {
      success: true,
      result,
      testMessage: message
    };
  } catch (error) {
    logger.error('Test analysis failed', { error: error.message });
    
    return {
      success: false,
      error: error.message,
      testMessage: message
    };
  }
};

export default {
  analyzeMessage,
  analyzeBatch,
  testAnalysis,
  doubleCheckLead
};
