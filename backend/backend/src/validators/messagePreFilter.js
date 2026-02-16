import logger from '../utils/logger.js';
import { extractCriteria } from '../prompts/promptBuilder.js';
import { getCriteriaEmbedding, generateEmbeddings, cosineSimilarity, isApiKeyBlocked, markApiKeyFailed } from '../services/embeddingService.js';

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
    'target': 'таргет целевой',
    'dev': 'дев разраб программист',
    'design': 'дизайн',
    'crypto': 'крипта крипто',
    'need': 'нужно надо требуется ищу',
    'want': 'хочу желаю'
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
  // Common markers for negative sections (case insensitive)
  const negativeMarkers = [
    'НЕ СЧИТАТЬ ЛИДОМ',
    'СТОП-ФАКТОРЫ',
    'СТОП ФАКТОРЫ',
    'STOP FACTORS',
    'NEGATIVE KEYWORDS',
    'ИСКЛЮЧЕНИЯ',
    'EXCLUDE',
    'IGNORE',
    'НЕ ЛИД',
    'NOT LEAD',
    'СТОП-СЛОВА',
    'STOP WORDS',
    '🛑',
    'ПРИМЕРЫ — ЭТО НЕ ЛИД',
    'ЭТО НЕ ЛИД',
    'НЕ ДОДУМЫВАЙ',
    'КРИТИЧЕСКИ ВАЖНО',
    'МУСОР'
  ];
  
  // Find the earliest occurrence of any negative marker and CUT everything after it
  let cutIndex = userCriteria.length;
  
  for (const marker of negativeMarkers) {
    const index = userCriteria.toUpperCase().indexOf(marker.toUpperCase());
    if (index !== -1 && index < cutIndex) {
      cutIndex = index;
    }
  }
  
  // Only use text BEFORE the first negative marker
  const positiveCriteria = userCriteria.substring(0, cutIndex);
  
  logger.debug('Extracted positive criteria for keywords', {
    originalLength: userCriteria.length,
    positiveLength: positiveCriteria.length,
    cutAt: cutIndex < userCriteria.length ? cutIndex : 'no cut'
  });

  // Extract meaningful words (longer than 3 chars, not common words)
  const commonWords = new Set([
    // Basic English Stop Words (Pronouns, Prepositions, Conjunctions ONLY)
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'who', 'are', 'people', 'someone', 'anyone', 'person', 'is', 'was', 'am',
    // Generic intent words (too broad, create noisy keyword matches)
    'need', 'want',
    
    // Russian Stop Words (Pronouns, Prepositions ONLY)
    'это', 'быть', 'или', 'как', 'его', 'для', 'так', 'уже', 'что',
    'можно', 'есть', 'был', 'была', 'были', 'буду', 'будет',
    'если', 'того', 'тогда', 'теперь', 'потом', 'сейчас', 'здесь', 'там',
    'он', 'она', 'они', 'мы', 'вы', 'ты', 'я', 'и', 'в', 'на', 'с', 'по', 'к',
    
    // Technical/Internal words
    'score', 'лид', 'лида', 'лиды', 'горячий', 'тёплый', 'теплый'
  ]);
  
  const keywords = new Set();
  
  // Extract from CLEANED positive criteria text (with transliterations applied)
  const expandedCriteria = addTransliterations(positiveCriteria);
  
  const words = expandedCriteria
    .toLowerCase()
    .replace(/[^\w\sа-яёА-ЯЁ]/g, ' ') // Remove punctuation but keep cyrillic
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
 * Rescue messages rejected by keyword filter using embedding similarity.
 * ADDITIVE ONLY: can only ADD messages back, never remove ones that passed keyword filter.
 *
 * Flow:
 * 1. Get/cache embedding for user's positive criteria
 * 2. Batch-embed all keyword-rejected messages (single API call)
 * 3. Compare cosine similarity with criteria embedding
 * 4. "Rescue" messages above threshold
 *
 * @param {array} keywordRejectedMessages - Messages that failed keyword filter (NOT quality-rejected)
 * @param {string} userCriteria - Full user criteria text
 * @param {string} userId - User identifier for embedding cache
 * @param {string} apiKey - OpenRouter API key
 * @returns {object} { rescued: Message[], stats: { total, rescued, avgSimilarity } }
 */
export const rescueWithEmbeddings = async (keywordRejectedMessages, userCriteria, userId, apiKey) => {
  const threshold = parseFloat(process.env.EMBEDDING_RESCUE_THRESHOLD || '0.35');
  const startTime = Date.now();

  if (!keywordRejectedMessages || keywordRejectedMessages.length === 0) {
    return { rescued: [], stats: { total: 0, rescued: 0, avgSimilarity: 0 } };
  }

  // Skip if this API key recently failed embedding calls (avoid spamming every 5s)
  if (isApiKeyBlocked(apiKey)) {
    logger.debug('Embedding rescue skipped: API key blocked (recent failure)', { userId });
    return { rescued: [], stats: { total: keywordRejectedMessages.length, rescued: 0, avgSimilarity: 0, skipped: 'api_key_blocked' } };
  }

  try {
    // Step 1: Get criteria embedding (cached after first call per user)
    const criteriaEmbedding = await getCriteriaEmbedding(userId, userCriteria, apiKey);

    // Step 2: Extract text from rejected messages for batch embedding
    const messageTexts = keywordRejectedMessages.map(msg => {
      const parts = [msg.message || ''];
      if (msg.bio) parts.push(msg.bio);
      if (msg.chat_name) parts.push(msg.chat_name);
      return parts.join(' ').substring(0, 500); // limit per message to control cost
    });

    // Step 3: Batch embed all rejected messages (single API call)
    const messageEmbeddings = await generateEmbeddings(messageTexts, apiKey);

    // Step 4: Compare and rescue
    const rescued = [];
    let totalSimilarity = 0;
    const similarities = [];

    for (let i = 0; i < keywordRejectedMessages.length; i++) {
      const similarity = cosineSimilarity(criteriaEmbedding, messageEmbeddings[i]);
      similarities.push(similarity);
      totalSimilarity += similarity;

      if (similarity >= threshold) {
        rescued.push(keywordRejectedMessages[i]);
        logger.debug('Embedding rescue: message rescued', {
          messageId: keywordRejectedMessages[i].id,
          similarity: similarity.toFixed(4),
          threshold
        });
      }
    }

    const duration = Date.now() - startTime;
    const avgSimilarity = keywordRejectedMessages.length > 0
      ? totalSimilarity / keywordRejectedMessages.length
      : 0;

    logger.info('Embedding rescue complete', {
      total: keywordRejectedMessages.length,
      rescued: rescued.length,
      rescueRate: `${Math.round((rescued.length / keywordRejectedMessages.length) * 100)}%`,
      avgSimilarity: avgSimilarity.toFixed(4),
      threshold,
      duration: `${duration}ms`
    });

    return {
      rescued,
      stats: {
        total: keywordRejectedMessages.length,
        rescued: rescued.length,
        avgSimilarity,
        duration
      }
    };
  } catch (error) {
    // GRACEFUL FALLBACK: If embeddings fail, just return empty rescue
    // The system continues working exactly as before — no regression
    logger.warn('Embedding rescue failed, falling back to keyword-only filter', {
      error: error.message,
      rejectedCount: keywordRejectedMessages.length,
      userId
    });

    // Mark this API key as incompatible to avoid retrying every 5 seconds
    markApiKeyFailed(apiKey, error.message);

    return {
      rescued: [],
      stats: {
        total: keywordRejectedMessages.length,
        rescued: 0,
        avgSimilarity: 0,
        error: error.message
      }
    };
  }
};

/**
 * Pre-filter array of messages
 * OPTIMIZED: Quality + keyword filtering to reduce API costs
 * Now with optional embedding rescue for keyword-rejected messages.
 * @param {array} messages - Messages to filter
 * @param {string} userCriteria - User-defined criteria
 * @param {object} options - Optional: { userId, apiKey } for embedding rescue
 * @returns {object} Filtered results
 */
export const preFilterMessages = async (messages, userCriteria, options = {}) => {
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
  
  // ── Embedding Rescue: try to save keyword-rejected messages ──
  const embeddingRescueEnabled = (process.env.EMBEDDING_RESCUE || 'true') === 'true';
  const { userId, apiKey } = options;

  if (embeddingRescueEnabled && userId && apiKey) {
    // Only rescue messages rejected by KEYWORDS (not quality issues)
    const keywordRejected = results.filtered
      .filter((_, idx) => {
        // The idx-th filtered message: check if it was keyword-rejected
        // We track reasons above, but need to identify which messages
        return true; // will re-check below
      })
      .map(item => item.message)
      .filter(msg => {
        // Re-run quality check to ensure we only rescue quality-passing messages
        const qc = checkMessageQuality(msg);
        return qc.isQuality;
      });

    if (keywordRejected.length > 0) {
      logger.info('Starting embedding rescue for keyword-rejected messages', {
        keywordRejectedCount: keywordRejected.length
      });

      const rescueResult = await rescueWithEmbeddings(keywordRejected, userCriteria, userId, apiKey);

      if (rescueResult.rescued.length > 0) {
        // Add rescued messages to passed list
        const rescuedIds = new Set(rescueResult.rescued.map(m => m.id));

        results.passed.push(...rescueResult.rescued);
        results.stats.passed += rescueResult.rescued.length;

        // Remove rescued messages from filtered list
        results.filtered = results.filtered.filter(item => !rescuedIds.has(item.message.id));
        results.stats.filtered -= rescueResult.rescued.length;

        // Track rescue stats
        results.stats.reasons['embedding_rescued'] = rescueResult.rescued.length;

        logger.info('Embedding rescue added messages back to analysis', {
          rescued: rescueResult.rescued.length,
          newPassedTotal: results.stats.passed
        });
      }

      results.stats.embeddingRescue = rescueResult.stats;
    }
  } else if (embeddingRescueEnabled && (!userId || !apiKey)) {
    logger.debug('Embedding rescue skipped: missing userId or apiKey', {
      hasUserId: !!userId,
      hasApiKey: !!apiKey
    });
  }
  
  const duration = Date.now() - startTime;
  const filterRate = results.stats.total > 0
    ? Math.round((results.stats.filtered / results.stats.total) * 100)
    : 0;
  
  logger.info('Pre-filtering complete', {
    total: results.stats.total,
    passed: results.stats.passed,
    filtered: results.stats.filtered,
    filterRate: `${filterRate}%`,
    duration: `${duration}ms`,
    reasons: results.stats.reasons,
    embeddingRescue: results.stats.embeddingRescue ? 'active' : 'off'
  });
  
  return results;
};

export default {
  extractKeywords,
  hasKeywordMatch,
  checkMessageQuality,
  hasContactInfo,
  preFilterMessage,
  preFilterMessages,
  rescueWithEmbeddings
};
