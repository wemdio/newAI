import logger from '../utils/logger.js';
import { ValidationError } from '../utils/errorHandler.js';

/**
 * Validate AI response structure and content
 * CRITICAL: Multiple validation layers to prevent hallucinations
 */

/**
 * Validate response structure
 * @param {object} response - AI response to validate
 * @returns {object} Validation result
 */
export const validateResponseStructure = (response) => {
  const errors = [];
  
  // Check required fields exist
  if (!response || typeof response !== 'object') {
    errors.push('Response must be a valid object');
    return { valid: false, errors };
  }
  
  // Validate is_match field
  if (typeof response.is_match !== 'boolean') {
    errors.push('is_match must be a boolean');
  }
  
  // Validate confidence_score
  if (typeof response.confidence_score !== 'number') {
    errors.push('confidence_score must be a number');
  } else if (response.confidence_score < 0 || response.confidence_score > 100) {
    errors.push('confidence_score must be between 0 and 100');
  }
  
  // Validate reasoning
  if (typeof response.reasoning !== 'string') {
    errors.push('reasoning must be a string');
  } else if (response.is_match === true && response.reasoning.trim().length === 0) {
    // For positives we require a human-readable reason; for negatives allow empty to reduce false invalids.
    errors.push('reasoning must be a non-empty string when is_match=true');
  }
  
  // Validate matched_criteria
  if (!Array.isArray(response.matched_criteria)) {
    errors.push('matched_criteria must be an array');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate confidence threshold
 * @param {number} confidenceScore - Confidence score from AI
 * @param {number} threshold - Minimum threshold (default 70)
 * @returns {boolean} Whether confidence meets threshold
 */
export const validateConfidenceThreshold = (confidenceScore, threshold = 70) => {
  const minThreshold = parseInt(process.env.AI_CONFIDENCE_THRESHOLD) || threshold;
  return confidenceScore >= minThreshold;
};

/**
 * Validate reasoning contains actual message content
 * This is CRITICAL for preventing hallucinations
 * @param {string} reasoning - AI reasoning text
 * @param {string} messageText - Original message text
 * @returns {object} Validation result
 */
export const validateReasoningContent = (reasoning, messageText) => {
  if (!reasoning || !messageText) {
    return {
      valid: false,
      reason: 'Missing reasoning or message text'
    };
  }
  
  const reasoningLower = reasoning.toLowerCase();
  const messageWords = messageText
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4) // Only significant words
    .filter(word => !/^(this|that|with|from|have|been|were|would|could|should)$/.test(word)); // Filter common words
  
  if (messageWords.length === 0) {
    return {
      valid: true,
      reason: 'Message too short to validate',
      matchCount: 0
    };
  }
  
  // Count how many significant words from the message appear in reasoning
  let matchCount = 0;
  const matchedWords = [];
  
  for (const word of messageWords) {
    if (reasoningLower.includes(word)) {
      matchCount++;
      matchedWords.push(word);
    }
  }
  
  // Calculate match percentage
  const matchPercentage = (matchCount / messageWords.length) * 100;
  
  // Require at least 15% of significant words to appear in reasoning
  const minMatchPercentage = 15;
  const valid = matchPercentage >= minMatchPercentage;
  
  return {
    valid,
    matchCount,
    totalWords: messageWords.length,
    matchPercentage: Math.round(matchPercentage),
    matchedWords,
    reason: valid 
      ? `Reasoning references ${matchCount}/${messageWords.length} significant words (${Math.round(matchPercentage)}%)`
      : `Reasoning only references ${matchCount}/${messageWords.length} words (${Math.round(matchPercentage)}%), minimum ${minMatchPercentage}% required`
  };
};

/**
 * Check for common hallucination patterns
 * @param {string} reasoning - AI reasoning text
 * @returns {object} Detection result
 */
export const detectHallucinationPatterns = (reasoning) => {
  const hallucinationIndicators = [
    'might be',
    'could be',
    'possibly',
    'perhaps',
    'seems like',
    'appears to',
    'may indicate',
    'suggests that',
    'likely that',
    'probably',
    'I think',
    'I believe',
    'in my opinion',
    'it\'s possible',
    'based on similar',
    'typically means',
    'usually indicates'
  ];
  
  const reasoningLower = reasoning.toLowerCase();
  const foundIndicators = [];
  
  for (const indicator of hallucinationIndicators) {
    if (reasoningLower.includes(indicator)) {
      foundIndicators.push(indicator);
    }
  }
  
  // If too many uncertainty indicators, mark as suspicious
  const suspiciousCount = foundIndicators.length;
  const isSuspicious = suspiciousCount >= 2;
  
  return {
    isSuspicious,
    suspiciousCount,
    foundIndicators,
    reason: isSuspicious 
      ? `Reasoning contains ${suspiciousCount} uncertainty indicators: ${foundIndicators.join(', ')}`
      : 'No significant hallucination patterns detected'
  };
};

/**
 * Check if response fabricates information not in message
 * @param {object} response - AI response
 * @param {object} message - Original message data
 * @returns {object} Validation result
 */
export const detectFabricatedInfo = (response, message) => {
  const { reasoning } = response;
  const { message: messageText, bio, chat_name } = message;
  
  // Combine all available text
  const availableText = [messageText, bio, chat_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  
  // Extract quoted text from reasoning (text in quotes)
  const quotedTexts = reasoning.match(/"([^"]+)"/g) || [];
  
  const fabricatedQuotes = [];
  
  for (const quote of quotedTexts) {
    const cleanQuote = quote.replace(/"/g, '').toLowerCase();
    
    // Check if this quote actually exists in the available text
    if (!availableText.includes(cleanQuote)) {
      fabricatedQuotes.push(quote);
    }
  }
  
  const hasFabrication = fabricatedQuotes.length > 0;
  
  return {
    hasFabrication,
    fabricatedQuotes,
    reason: hasFabrication
      ? `Found ${fabricatedQuotes.length} fabricated quotes: ${fabricatedQuotes.join(', ')}`
      : 'No fabricated quotes detected'
  };
};

/**
 * Comprehensive validation of AI response
 * SIMPLIFIED: Only structure validation, no hallucination/fabrication checks
 * @param {object} response - AI response
 * @param {object} message - Original message
 * @param {number} minConfidence - Minimum confidence threshold (not used in simplified mode)
 * @returns {object} Complete validation result
 */
export const validateAIResponse = (response, message, minConfidence = 70) => {
  const validations = {
    structure: validateResponseStructure(response)
  };
  
  // Only check structure - trust AI for everything else
  const isValid = validations.structure.valid;
  
  return {
    valid: isValid,
    reason: isValid ? 'Structure validation passed' : 'Invalid response structure',
    validations
  };
};

/**
 * Log validation results
 * SIMPLIFIED: Only logs basic validation info
 * @param {object} validationResult - Result from validateAIResponse
 * @param {object} message - Original message
 */
export const logValidationResult = (validationResult, message) => {
  const { valid, reason } = validationResult;
  
  if (!valid) {
    logger.warn('AI response validation failed (structure)', {
      messageId: message.id,
      reason
    });
  } else {
    logger.debug('AI response validation passed (structure)', {
      messageId: message.id
    });
  }
};

export default {
  validateResponseStructure,
  validateConfidenceThreshold,
  validateReasoningContent,
  detectHallucinationPatterns,
  detectFabricatedInfo,
  validateAIResponse,
  logValidationResult
};

