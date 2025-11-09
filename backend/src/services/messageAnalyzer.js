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
 * Analyze multiple messages in batch
 * @param {array} messages - Array of messages to analyze
 * @param {string} userCriteria - User-defined criteria
 * @param {string} apiKey - OpenRouter API key
 * @param {object} options - Batch options
 * @returns {object} Batch analysis results
 */
export const analyzeBatch = async (messages, userCriteria, apiKey, options = {}) => {
  const {
    maxConcurrent = 3, // Max concurrent API calls
    stopOnError = false // Whether to stop on first error
  } = options;
  
  const startTime = Date.now();
  
  logger.info('Starting batch analysis', {
    totalMessages: messages.length,
    maxConcurrent
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
  
  // Process messages in batches to control concurrency
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

