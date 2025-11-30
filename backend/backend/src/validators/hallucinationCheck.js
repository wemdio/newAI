import logger from '../utils/logger.js';

/**
 * Additional hallucination detection checks
 * These are extra safety measures beyond the main validator
 */

/**
 * Check if AI is making assumptions about context not provided
 * @param {string} reasoning - AI reasoning
 * @param {object} message - Original message
 * @returns {object} Check result
 */
export const checkUnprovidedContext = (reasoning, message) => {
  const suspiciousAssumptions = [
    // Assumptions about intent
    'wants to',
    'planning to',
    'intends to',
    'is going to',
    'will probably',
    
    // Assumptions about background
    'has experience',
    'previously worked',
    'background in',
    'history of',
    
    // Assumptions about resources
    'has budget',
    'can afford',
    'has money',
    'is wealthy',
    
    // Assumptions about role/status
    'is a decision maker',
    'is the owner',
    'is in charge',
    'has authority'
  ];
  
  const reasoningLower = reasoning.toLowerCase();
  const foundAssumptions = [];
  
  for (const assumption of suspiciousAssumptions) {
    if (reasoningLower.includes(assumption)) {
      foundAssumptions.push(assumption);
    }
  }
  
  // Check if these assumptions are actually supported by the message
  const messageText = (message.message || '').toLowerCase();
  const bio = (message.bio || '').toLowerCase();
  const combinedText = messageText + ' ' + bio;
  
  // Filter out assumptions that ARE supported by text
  const unsupportedAssumptions = foundAssumptions.filter(assumption => {
    // Simple check: if the assumption uses words that appear in message, might be supported
    const assumptionWords = assumption.split(' ').filter(w => w.length > 3);
    const hasSupport = assumptionWords.some(word => combinedText.includes(word));
    return !hasSupport;
  });
  
  const hasSuspiciousAssumptions = unsupportedAssumptions.length > 0;
  
  return {
    hasSuspiciousAssumptions,
    unsupportedAssumptions,
    reason: hasSuspiciousAssumptions
      ? `Found ${unsupportedAssumptions.length} unsupported assumptions: ${unsupportedAssumptions.join(', ')}`
      : 'No unsupported assumptions detected'
  };
};

/**
 * Check if reasoning references specific message content
 * @param {string} reasoning - AI reasoning
 * @param {object} message - Original message
 * @returns {object} Check result
 */
export const checkSpecificityLevel = (reasoning, message) => {
  const messageText = (message.message || '').toLowerCase();
  const bio = (message.bio || '').toLowerCase();
  const combinedText = messageText + ' ' + bio;
  
  // Extract words from message (5+ chars)
  const messageWords = combinedText
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 5);
  
  // Extract words from reasoning (5+ chars)
  const reasoningWords = reasoning
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 5);
  
  // Count how many message words appear in reasoning
  const matchedWords = messageWords.filter(word => 
    reasoningWords.includes(word)
  );
  
  // Check for quoted text
  const quotes = reasoning.match(/"([^"]+)"/g) || [];
  
  // Reasoning is specific if:
  // 1. It has quoted text, OR
  // 2. It references at least 2 words from the message
  const isSpecific = quotes.length > 0 || matchedWords.length >= 2;
  
  return {
    isSpecific,
    specificQuotes: quotes.length,
    matchedWords: matchedWords.length,
    totalMessageWords: messageWords.length,
    reason: isSpecific
      ? `Reasoning is specific (${quotes.length} quotes, ${matchedWords.length} matched words)`
      : `Reasoning is too generic (${quotes.length} quotes, ${matchedWords.length}/${messageWords.length} matched words)`
  };
};

/**
 * Check if matched criteria actually relate to message content
 * @param {array} matchedCriteria - Criteria AI claims matched
 * @param {object} message - Original message
 * @returns {object} Check result
 */
export const validateMatchedCriteria = (matchedCriteria, message) => {
  if (!matchedCriteria || matchedCriteria.length === 0) {
    return {
      valid: true,
      reason: 'No matched criteria to validate'
    };
  }
  
  const messageText = (message.message || '').toLowerCase();
  const bio = (message.bio || '').toLowerCase();
  const combinedText = messageText + ' ' + bio;
  
  const unsupportedCriteria = [];
  
  for (const criterion of matchedCriteria) {
    // Extract keywords from criterion
    const keywords = criterion
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4);
    
    // Check if at least some keywords appear in message
    const hasKeywordMatch = keywords.some(keyword => 
      combinedText.includes(keyword)
    );
    
    if (!hasKeywordMatch && keywords.length > 0) {
      unsupportedCriteria.push(criterion);
    }
  }
  
  // More lenient: allow if at least 50% of criteria are supported
  // This prevents false negatives when AI correctly identifies semantic matches
  const supportRate = (matchedCriteria.length - unsupportedCriteria.length) / matchedCriteria.length;
  const valid = supportRate >= 0.5;
  
  return {
    valid,
    unsupportedCriteria,
    supportedCount: matchedCriteria.length - unsupportedCriteria.length,
    totalCriteria: matchedCriteria.length,
    supportRate: Math.round(supportRate * 100),
    reason: valid
      ? `${matchedCriteria.length - unsupportedCriteria.length}/${matchedCriteria.length} criteria supported (${Math.round(supportRate * 100)}%)`
      : `Only ${matchedCriteria.length - unsupportedCriteria.length}/${matchedCriteria.length} criteria supported (${Math.round(supportRate * 100)}%), need 50%+`
  };
};

/**
 * Check for circular reasoning
 * @param {string} reasoning - AI reasoning
 * @returns {object} Check result
 */
export const checkCircularReasoning = (reasoning) => {
  const circularPatterns = [
    'matches the criteria because it matches',
    'is a lead because they are looking',
    'qualifies because they qualify',
    'fits because it fits',
    'relevant because it\'s relevant'
  ];
  
  const reasoningLower = reasoning.toLowerCase();
  const foundPatterns = circularPatterns.filter(pattern => 
    reasoningLower.includes(pattern)
  );
  
  const hasCircularReasoning = foundPatterns.length > 0;
  
  return {
    hasCircularReasoning,
    foundPatterns,
    reason: hasCircularReasoning
      ? `Circular reasoning detected: ${foundPatterns.join(', ')}`
      : 'No circular reasoning detected'
  };
};

/**
 * Comprehensive hallucination check
 * @param {object} aiResponse - Complete AI response
 * @param {object} message - Original message
 * @returns {object} Complete check result
 */
export const comprehensiveHallucinationCheck = (aiResponse, message) => {
  const checks = {
    unprovidedContext: checkUnprovidedContext(aiResponse.reasoning, message),
    specificity: checkSpecificityLevel(aiResponse.reasoning, message),
    matchedCriteria: validateMatchedCriteria(aiResponse.matched_criteria, message),
    circularReasoning: checkCircularReasoning(aiResponse.reasoning)
  };
  
  // Determine if response passes all checks
  const passed = 
    !checks.unprovidedContext.hasSuspiciousAssumptions &&
    checks.specificity.isSpecific &&
    checks.matchedCriteria.valid &&
    !checks.circularReasoning.hasCircularReasoning;
  
  // Collect all issues
  const issues = [];
  if (checks.unprovidedContext.hasSuspiciousAssumptions) {
    issues.push(checks.unprovidedContext.reason);
  }
  if (!checks.specificity.isSpecific) {
    issues.push(checks.specificity.reason);
  }
  if (!checks.matchedCriteria.valid) {
    issues.push(checks.matchedCriteria.reason);
  }
  if (checks.circularReasoning.hasCircularReasoning) {
    issues.push(checks.circularReasoning.reason);
  }
  
  return {
    passed,
    checks,
    issues,
    reason: passed 
      ? 'Passed all hallucination checks' 
      : `Failed checks: ${issues.join('; ')}`
  };
};

/**
 * Log hallucination check results
 * @param {object} checkResult - Result from comprehensiveHallucinationCheck
 * @param {object} message - Original message
 */
export const logHallucinationCheck = (checkResult, message) => {
  if (!checkResult.passed) {
    logger.warn('Hallucination check failed', {
      messageId: message.id,
      issues: checkResult.issues,
      checks: checkResult.checks
    });
  } else {
    logger.debug('Hallucination check passed', {
      messageId: message.id
    });
  }
};

export default {
  checkUnprovidedContext,
  checkSpecificityLevel,
  validateMatchedCriteria,
  checkCircularReasoning,
  comprehensiveHallucinationCheck,
  logHallucinationCheck
};

