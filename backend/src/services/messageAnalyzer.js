import { getOpenRouter } from '../config/openrouter.js';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt.js';
import { buildAnalysisPrompt } from '../prompts/promptBuilder.js';
import { validateAIResponse, logValidationResult } from '../validators/aiResponseValidator.js';
import { estimateTokens, calculateCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { AIServiceError, retryWithBackoff } from '../utils/errorHandler.js';

/**
 * Core AI message analysis service
 * Handles communication with OpenRouter and validation
 */

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
    
    // Get OpenRouter client
    logger.info('Getting OpenRouter client', {
      messageId: message.id,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
    });
    
    const client = getOpenRouter(apiKey);
    const model = process.env.AI_MODEL || 'google/gemini-2.0-flash-001';
    
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
        max_tokens: 500
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
    
    // Simple validation: trust AI if confidence >= 60 (practical threshold)
    const isValidMatch = 
      validation.valid && 
      aiResponse.is_match &&
      aiResponse.confidence_score >= 60;
    
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
      meetsThreshold: aiResponse.confidence_score >= 60,
      duration,
      cost: cost.totalCost
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('AI analysis failed', {
      messageId: message.id,
      error: error.message,
      duration
    });
    
    throw new AIServiceError('Failed to analyze message', {
      messageId: message.id,
      originalError: error.message,
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
2. Верни массив из ${batchSize} JSON объектов
3. Порядок результатов должен соответствовать порядку сообщений
4. Каждый результат должен содержать: id, is_match, confidence_score, reasoning, matched_criteria

ФОРМАТ ОТВЕТА:
[
  {
    "id": "message_id_1",
    "is_match": boolean,
    "confidence_score": 0-100,
    "reasoning": "краткое объяснение",
    "matched_criteria": ["критерий1", "критерий2"]
  },
  ... (${batchSize} объектов)
]`;

    // Estimate tokens
    const inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    const estimatedOutputTokens = batchSize * 100; // ~100 tokens per result
    
    // Make API call
    const client = getOpenRouter(apiKey);
    const model = process.env.AI_MODEL || 'google/gemini-2.0-flash-001';
    
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
        response_format: { type: 'json_object' },
        max_tokens: 2000 // Increased for batch
      });
    }, 3, 1000);
    
    const duration = Date.now() - startTime;
    
    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIServiceError('Empty response from AI');
    }
    
    let batchResults;
    try {
      const parsed = JSON.parse(content);
      // Handle both array and object with array
      batchResults = Array.isArray(parsed) ? parsed : (parsed.results || parsed.analyses || []);
    } catch (parseError) {
      throw new AIServiceError(`Failed to parse batch response: ${parseError.message}`);
    }
    
    if (!Array.isArray(batchResults) || batchResults.length !== batchSize) {
      throw new AIServiceError(
        `Expected ${batchSize} results, got ${batchResults?.length || 0}`
      );
    }
    
    // Calculate cost
    const actualTokens = response.usage || {
      prompt_tokens: inputTokens,
      completion_tokens: estimatedOutputTokens,
      total_tokens: inputTokens + estimatedOutputTokens
    };
    const totalCost = calculateCost(actualTokens.total_tokens, model);
    const costPerMessage = totalCost / batchSize;
    
    // Process and validate each result
    const results = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const aiResult = batchResults[i];
      
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
      
      const result = {
        isMatch: validation.data.is_match,
        aiResponse: validation.data,
        metadata: {
          duration: duration / batchSize, // Average duration per message
          cost: costPerMessage,
          tokens: {
            input: actualTokens.prompt_tokens / batchSize,
            output: actualTokens.completion_tokens / batchSize,
            total: actualTokens.total_tokens / batchSize
          },
          model,
          validationPassed: validation.isValid
        }
      };
      
      // Log each result individually (same format as single message)
      logger.info('AI analysis complete (batch)', {
        messageId: message.id,
        isMatch: result.isMatch,
        confidence: result.aiResponse.confidence_score,
        validationPassed: validation.isValid,
        meetsThreshold: result.aiResponse.confidence_score >= 60,
        duration: Math.round(duration / batchSize),
        cost: costPerMessage.toFixed(6)
      });
      
      results.push(result);
    }
    
    logger.info('Batch analysis complete', {
      batchSize,
      totalDuration: duration,
      totalCost: totalCost.toFixed(6),
      avgCostPerMessage: costPerMessage.toFixed(6),
      matches: results.filter(r => r.isMatch).length
    });
    
    return results;
    
  } catch (error) {
    logger.error('Batch AI analysis failed', {
      batchSize,
      messageIds: messages.map(m => m.id),
      error: error.message
    });
    
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
          error: individualError.message
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
    maxConcurrent = 3, // Max concurrent API calls
    stopOnError = false, // Whether to stop on first error
    useBatchApi = true, // NEW: Use batch API (5 messages per call)
    batchSize = 5 // NEW: Messages per API call
  } = options;
  
  const startTime = Date.now();
  
  logger.info('Starting batch analysis', {
    totalMessages: messages.length,
    useBatchApi,
    batchSize: useBatchApi ? batchSize : 'N/A'
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
  
  if (useBatchApi) {
    // NEW: Process messages in chunks using batch API (5 messages per API call)
    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize);
      
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
    }
  } else {
    // OLD: Process messages individually with concurrency control
    for (let i = 0; i < messages.length; i += maxConcurrent) {
      const batch = messages.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (message) => {
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
      
      await Promise.all(batchPromises);
    }
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
    duration
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
  testAnalysis
};

