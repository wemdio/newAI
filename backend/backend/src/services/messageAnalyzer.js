import { getOpenRouter } from '../config/openrouter.js';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt.js';
import { buildAnalysisPrompt } from '../prompts/promptBuilder.js';
import { validateAIResponse, logValidationResult } from '../validators/aiResponseValidator.js';
import { estimateTokens, calculateCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { AIServiceError, retryWithBackoff } from '../utils/errorHandler.js';
import PQueue from 'p-queue';

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
  const model = 'google/gemini-3-pro-preview';

  try {
    logger.info('Starting Double Check with Gemini', {
      messageId: message.id,
      initialConfidence: initialAnalysis.confidence_score
    });

    const client = getOpenRouter(apiKey);
    
    const prompt = `ТЫ - ЭКСПЕРТ ПО КОНТРОЛЮ КАЧЕСТВА ЛИДОВ.
Твоя задача - перепроверить решение предыдущего AI, который посчитал это сообщение лидом.

КРИТЕРИИ ПОИСКА:
${userCriteria}

СООБЩЕНИЕ:
${message.message || ''}
${message.bio ? `Био: ${message.bio}` : ''}
${message.chat_name ? `Канал: ${message.chat_name}` : ''}

ПРЕДЫДУЩИЙ АНАЛИЗ:
Причина: "${initialAnalysis.reasoning}"
Уверенность: ${initialAnalysis.confidence_score}%

ЗАДАЧА:
1. Прочитай сообщение ОЧЕНЬ ВНИМАТЕЛЬНО.
2. Действительно ли человек ИЩЕТ то, что указано в критериях?
3. Нет ли здесь ложного срабатывания (например, он продает, а не покупает)?
4. Если есть сомнения - отвергай.

Верни JSON:
{
  "verified": boolean,
  "confidence": number,
  "reasoning": "твое обоснование (на русском)"
}`;

    const response = await retryWithBackoff(async () => {
      return await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1000
      });
    }, 3, 1000);

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from Gemini');

    let result;
    try {
        // Handle markdown code blocks if present
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
        result = JSON.parse(cleanContent);
    } catch (e) {
        logger.warn('Failed to parse Gemini response', { content });
        throw e;
    }

    const duration = Date.now() - startTime;
    
    logger.info('Gemini Double Check complete', {
        verified: result.verified,
        reason: result.reasoning,
        duration
    });

    return result;

  } catch (error) {
    logger.error('Double check failed', { error: error.message });
    // If double check fails, we fall back to trusting the original analysis (fail open) 
    // OR fail closed. Let's fail open but log it.
    return { verified: true, reasoning: "Double check failed, trusting initial result", confidence: initialAnalysis.confidence_score }; 
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
    // Build prompts
    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildAnalysisPrompt(message, userCriteria);
    
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
    const model = process.env.AI_MODEL || 'deepseek/deepseek-v3.2';
    
    logger.info('Making OpenRouter API call', {
      messageId: message.id,
      model,
      hasClient: !!client
    });
    
    // Make API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0, // Zero temperature for deterministic results
        top_p: 1, // Disable nucleus sampling for consistency
        seed: 12345, // Fixed seed for reproducibility
        response_format: { type: 'json_object' },
        max_tokens: 1000 // Increased to allow for reasoning
      });
    }, 3, 1000);
    
    const duration = Date.now() - startTime;
    
    // Extract response content
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIServiceError('Empty response from AI');
    }
    
    // Parse JSON response
    let aiResponse;
    try {
      aiResponse = JSON.parse(content);
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
    
    // Build batch prompt
    const systemPrompt = SYSTEM_PROMPT;
    const messagesArray = messages.map(msg => ({
      id: msg.id.toString(),
      message: msg.message || '',
      chat_name: msg.chat_name || '',
      username: msg.username || '',
      bio: msg.bio || ''
    }));
    
    const userPrompt = `КРИТЕРИИ ПОЛЬЗОВАТЕЛЯ (следуй точно, ОСОБЕННО секцию "НЕ СЧИТАТЬ ЛИДОМ"):
${userCriteria}

ПРОАНАЛИЗИРУЙ СЛЕДУЮЩИЕ ${batchSize} СООБЩЕНИЙ:
${JSON.stringify(messagesArray, null, 2)}

ВАЖНО:
1. Проанализируй КАЖДОЕ сообщение ОТДЕЛЬНО (не смешивай контекст!)
2. Верни ТОЛЬКО МАССИВ из ${batchSize} JSON объектов (без дополнительного текста!)
3. Порядок результатов должен соответствовать порядку сообщений
4. Каждый результат должен содержать: id, is_match, confidence_score, reasoning, matched_criteria

КРИТИЧЕСКИ ВАЖНО: Ответ должен начинаться с [ и заканчиваться ] - это должен быть чистый JSON массив!

ФОРМАТ ОТВЕТА (ТОЛЬКО ЭТОТ JSON МАССИВ, БЕЗ ТЕКСТА):
[
  {
    "id": "message_id_1",
    "is_match": boolean,
    "confidence_score": 0-100,
    "reasoning": "краткое объяснение на русском",
    "matched_criteria": ["критерий1", "критерий2"]
  },
  {
    "id": "message_id_2",
    "is_match": boolean,
    "confidence_score": 0-100,
    "reasoning": "краткое объяснение на русском",
    "matched_criteria": []
  }
  ... (всего ${batchSize} объектов)
]`;

    // Get OpenRouter client and model
    const client = getOpenRouter(apiKey);
    const model = process.env.AI_MODEL || 'deepseek/deepseek-v3.2';
    
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
      return await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        top_p: 1,
        seed: 12345,
        // Don't use response_format for arrays - Gemini returns plain JSON array
        max_tokens: 4000 // Increased for batch + reasoning
      });
    }, 3, 1000);
    
    const duration = Date.now() - startTime;
    
    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIServiceError('Empty response from AI');
    }
    
    logger.info('Raw batch response received', {
      batchSize,
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
      const aiResult = batchResults[i];
      
      // Check if result exists
      if (!aiResult) {
        logger.error('Missing batch result', {
          messageId: message.id,
          position: i,
          totalResults: batchResults.length
        });
        throw new AIServiceError(`Missing result for message at position ${i}`);
      }
      
      // Validate result has correct ID
      if (aiResult.id !== message.id.toString()) {
        logger.warn('Batch result ID mismatch', {
          expected: message.id,
          received: aiResult.id,
          position: i
        });
      }
      
      // Validate AI response structure
      const validation = validateAIResponse(aiResult);
      logValidationResult(validation, message.id);
      
      // FIXED: validateAIResponse returns { valid, reason, validations }, NOT { isValid, data }!
      const result = {
        isMatch: aiResult.is_match && aiResult.confidence_score >= 70,
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
    
    // Fallback: analyze individually if batch fails
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
          data: individualError.details?.data // Use details from analyzeMessage
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
