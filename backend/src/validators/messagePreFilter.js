import logger from '../utils/logger.js';
import { extractCriteria } from '../prompts/promptBuilder.js';

/**
 * Pre-filter messages before sending to AI
 * This reduces AI costs by filtering out obvious non-matches
 */

/**
 * Create transliteration map for common business terms
 * @param {string} text - Text to expand with transliterations
 * @returns {string} Text with both latin and cyrillic versions
 */
const addTransliterations = (text) => {
  const transliterations = {
    'outreach': 'аутрич аутричить аутричу',
    'lead': 'лид лиды лидов лидами лидген лидгенит лидогенерация',
    'generation': 'генерация генерацией генерить генерю генит',
    'appointment': 'апоинтмент апоинт',
    'setting': 'сеттинг сеттить',
    'linkedin': 'линкедин линкедина линкед',
    'email': 'емейл имейл мейл емайл',
    'cold': 'колд холодный холодные',
    'saas': 'саас',
    'telegram': 'телеграм телега тг',
    'sales': 'сейлс продажи продаж',
    'meeting': 'митинг встреча встречи',
    'call': 'колл звонок звонки звонить',
    'manager': 'менеджер манагер',
    'marketing': 'маркетинг реклама',
    'business': 'бизнес',
    'client': 'клиент клиенты клиентов',
    'service': 'сервис услуга услуги',
    'target': 'таргет целевой'
  };
  
  let expandedText = text.toLowerCase();
  
  // Add transliteration for each found term
  for (const [latin, cyrillicVariants] of Object.entries(transliterations)) {
    const cyrillicWords = cyrillicVariants.split(' ');
    
    // If latin term found, add all cyrillic variants
    if (expandedText.includes(latin)) {
      expandedText += ' ' + cyrillicVariants;
    }
    
    // If any cyrillic variant found, add latin term
    for (const cyrWord of cyrillicWords) {
      if (expandedText.includes(cyrWord)) {
        expandedText += ' ' + latin;
        break; // Only add once
      }
    }
  }
  
  return expandedText;
};

/**
 * Extract keywords from user criteria
 * @param {string} userCriteria - User-defined lead criteria
 * @returns {array} Array of keywords (expanded with transliterations)
 */
export const extractKeywords = (userCriteria) => {
  // Extract criteria points
  const criteria = extractCriteria(userCriteria);
  
  // Extract meaningful words (longer than 3 chars, not common words)
  const commonWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'who', 'are', 'looking', 'need', 'want', 'find', 'help', 'seeking',
    'ask', 'asking', 'mention', 'mentioning', 'discuss', 'discussing',
    // Russian common words
    'это', 'быть', 'или', 'как', 'его', 'для', 'так', 'уже', 'что',
    'можно', 'нужно', 'есть', 'был', 'была', 'были', 'буду', 'будет',
    'если', 'того', 'тогда', 'теперь', 'потом', 'сейчас', 'здесь', 'там'
  ]);
  
  const keywords = new Set();
  
  // Extract from full criteria text (with transliterations applied)
  const expandedCriteria = addTransliterations(userCriteria);
  
  const words = expandedCriteria
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !commonWords.has(word));
  
  words.forEach(word => keywords.add(word));
  
  return Array.from(keywords);
};

/**
 * Check if message contains any of the keywords
 * @param {object} message - Message data
 * @param {array} keywords - Array of keywords to check
 * @returns {object} Match result
 */
export const hasKeywordMatch = (message, keywords) => {
  if (!keywords || keywords.length === 0) {
    // If no keywords, pass through (conservative approach)
    return { matches: true, matchedKeywords: [], reason: 'No keywords to filter' };
  }
  
  // Combine all searchable text
  const searchableText = [
    message.message,
    message.bio,
    message.chat_name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  
  // Expand text with transliterations
  const expandedSearchText = addTransliterations(searchableText);
  
  // Find matching keywords
  const matchedKeywords = keywords.filter(keyword => 
    expandedSearchText.includes(keyword.toLowerCase())
  );
  
  const matches = matchedKeywords.length > 0;
  
  return {
    matches,
    matchedKeywords,
    totalKeywords: keywords.length,
    reason: matches 
      ? `Matched ${matchedKeywords.length}/${keywords.length} keywords: ${matchedKeywords.slice(0, 5).join(', ')}` 
      : `No keyword matches found (searched for ${keywords.length} keywords)`
  };
};

/**
 * Check message quality (length, content)
 * SIMPLIFIED: Very basic checks, let AI handle the rest
 * @param {object} message - Message data
 * @returns {object} Quality check result
 */
export const checkMessageQuality = (message) => {
  const issues = [];
  
  // Check if message text exists
  if (!message.message || typeof message.message !== 'string') {
    issues.push('No message text');
  }
  
  // RELAXED: Only reject VERY short messages (< 5 characters)
  const messageLength = message.message?.length || 0;
  if (messageLength < 5) {
    issues.push('Message too short (< 5 characters)');
  }
  
  // RELAXED: Only reject obvious spam (10+ repeated characters)
  if (/(.)\1{10,}/.test(message.message || '')) {
    issues.push('Message appears to be spam (repeated characters)');
  }
  
  const isQuality = issues.length === 0;
  
  return {
    isQuality,
    issues,
    messageLength,
    reason: isQuality ? 'Message passes quality checks' : issues.join('; ')
  };
};

/**
 * Check if message has contact information
 * Leads should typically have some way to contact them
 * @param {object} message - Message data
 * @returns {object} Contact info check result
 */
export const hasContactInfo = (message) => {
  const contactMethods = [];
  
  if (message.username) contactMethods.push('username');
  if (message.profile_link) contactMethods.push('profile_link');
  if (message.first_name || message.last_name) contactMethods.push('name');
  
  // Check message text for email, phone, etc.
  const messageText = message.message || '';
  if (/@\w+\.\w+/.test(messageText)) contactMethods.push('email in message');
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(messageText)) contactMethods.push('phone in message');
  if (/@\w+/.test(messageText)) contactMethods.push('handle in message');
  
  const hasContact = contactMethods.length > 0;
  
  return {
    hasContact,
    contactMethods,
    reason: hasContact 
      ? `Contact available via: ${contactMethods.join(', ')}` 
      : 'No contact information available'
  };
};

/**
 * Pre-filter a single message
 * OPTIMIZED: Quality check + soft keyword matching to reduce API costs
 * @param {object} message - Message to filter
 * @param {string} userCriteria - User-defined criteria
 * @param {array} keywords - Pre-extracted keywords (optional, will extract if not provided)
 * @returns {object} Filter result
 */
export const preFilterMessage = (message, userCriteria, keywords = null) => {
  // Run quality check
  const qualityCheck = checkMessageQuality(message);
  const contactCheck = hasContactInfo(message);
  
  // Extract keywords if not provided
  const messageKeywords = keywords || extractKeywords(userCriteria);
  
  // SOFT keyword matching: pass if quality OK AND (no keywords OR at least 1 keyword matches)
  // This filters out obviously irrelevant messages while still allowing AI to make final decision
  let keywordCheck = { matches: true, reason: 'No keywords to filter' };
  if (messageKeywords && messageKeywords.length > 0) {
    keywordCheck = hasKeywordMatch(message, messageKeywords);
  }
  
  // Message passes if:
  // 1. Quality check passes
  // 2. At least 1 keyword matches (if keywords exist) OR no keywords defined
  const passes = qualityCheck.isQuality && keywordCheck.matches;
  
  const result = {
    passes,
    checks: {
      quality: qualityCheck,
      keywords: keywordCheck,
      contact: contactCheck
    },
    message: {
      id: message.id,
      length: message.message?.length || 0,
      hasUsername: !!message.username
    }
  };
  
  return result;
};

/**
 * Pre-filter array of messages
 * OPTIMIZED: Quality + keyword filtering to reduce API costs
 * @param {array} messages - Messages to filter
 * @param {string} userCriteria - User-defined criteria
 * @returns {object} Filtered results
 */
export const preFilterMessages = (messages, userCriteria) => {
  const startTime = Date.now();
  
  // Extract keywords once for all messages
  const keywords = extractKeywords(userCriteria);
  
  logger.info('Pre-filtering messages (optimized mode)', {
    totalMessages: messages.length,
    keywordsCount: keywords.length,
    mode: 'quality + keywords'
  });
  
  const results = {
    passed: [],
    filtered: [],
    stats: {
      total: messages.length,
      passed: 0,
      filtered: 0,
      reasons: {}
    }
  };
  
  for (const message of messages) {
    const filterResult = preFilterMessage(message, userCriteria, keywords);
    
    if (filterResult.passes) {
      results.passed.push(message);
      results.stats.passed++;
    } else {
      // Determine primary filter reason
      let primaryReason = 'unknown';
      if (!filterResult.checks.quality.isQuality) {
        primaryReason = 'quality';
      } else if (!filterResult.checks.keywords.matches) {
        primaryReason = 'keywords';
      }
      
      results.filtered.push({
        message: message,
        reason: filterResult.checks.quality.reason || filterResult.checks.keywords.reason
      });
      results.stats.filtered++;
      
      // Track filter reasons
      results.stats.reasons[primaryReason] = (results.stats.reasons[primaryReason] || 0) + 1;
    }
  }
  
  const duration = Date.now() - startTime;
  const filterRate = Math.round((results.stats.filtered / results.stats.total) * 100);
  
  logger.info('Pre-filtering complete', {
    total: results.stats.total,
    passed: results.stats.passed,
    filtered: results.stats.filtered,
    filterRate: `${filterRate}%`,
    duration: `${duration}ms`,
    reasons: results.stats.reasons
  });
  
  return results;
};

export default {
  extractKeywords,
  hasKeywordMatch,
  checkMessageQuality,
  hasContactInfo,
  preFilterMessage,
  preFilterMessages
};

