import { getOpenRouter } from '../config/openrouter.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Embedding service for semantic similarity matching.
 * Used as a "rescue" mechanism for messages that keyword filter rejected
 * but might still be relevant based on meaning.
 *
 * Uses OpenRouter's /embeddings endpoint with a lightweight model.
 * All embeddings for user criteria are cached in-memory (Map by userId).
 */

// Default embedding model — cheap and fast via OpenRouter
const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

// In-memory cache: Map<userId, { embedding: number[], promptHash: string }>
const criteriaEmbeddingCache = new Map();

// Track API keys with recent embedding failures to avoid spamming on transient errors.
// Map<apiKeyPrefix, { failedAt: number, error: string }>
// Cooldown: 10 minutes — OpenRouter embedding endpoint is intermittently unreliable,
// so we pause and retry later rather than blocking permanently.
const failedApiKeys = new Map();
const FAILED_KEY_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check if this API key has recently failed embedding calls.
 * Prevents spamming the API every 5 seconds during transient outages.
 */
export const isApiKeyBlocked = (apiKey) => {
  if (!apiKey) return true;
  const prefix = apiKey.substring(0, 12);
  const entry = failedApiKeys.get(prefix);
  if (!entry) return false;
  if (Date.now() - entry.failedAt > FAILED_KEY_COOLDOWN_MS) {
    failedApiKeys.delete(prefix);
    return false; // Cooldown expired, allow retry
  }
  return true;
};

export const markApiKeyFailed = (apiKey, error) => {
  if (!apiKey) return;
  const prefix = apiKey.substring(0, 12);
  failedApiKeys.set(prefix, { failedAt: Date.now(), error });
  logger.info('Embedding paused for this key (10min cooldown)', {
    keyPrefix: prefix + '...',
    error
  });
};

/**
 * Generate a SHA-256 hash of a string (for cache invalidation)
 * @param {string} text
 * @returns {string} hex hash
 */
const hashText = (text) => {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
};

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} cosine similarity
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
};

/**
 * Generate embedding for a single text via OpenRouter.
 * @param {string} text - Text to embed
 * @param {string} apiKey - OpenRouter API key
 * @returns {number[]} Embedding vector
 */
export const generateEmbedding = async (text, apiKey) => {
  const model = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const client = getOpenRouter(apiKey);

  let response;
  try {
    response = await client.embeddings.create({
      model,
      input: text
    });
  } catch (apiError) {
    // Some OpenRouter API keys may not have access to embedding models
    logger.warn('Embedding API call failed', {
      model,
      error: apiError.message,
      status: apiError.status || apiError.code,
      type: apiError.type
    });
    throw new Error(`Embedding API error: ${apiError.message}`);
  }

  if (!response.data || !response.data[0] || !response.data[0].embedding) {
    logger.warn('Unexpected embedding response format', {
      model,
      hasData: !!response.data,
      isArray: Array.isArray(response.data),
      responseKeys: response ? Object.keys(response) : 'null',
      responsePreview: JSON.stringify(response).substring(0, 300)
    });
    throw new Error('Invalid embedding response: missing data[0].embedding');
  }

  return response.data[0].embedding;
};

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 * OpenRouter/OpenAI embedding endpoint accepts an array of strings.
 * @param {string[]} texts - Array of texts to embed
 * @param {string} apiKey - OpenRouter API key
 * @returns {number[][]} Array of embedding vectors (same order as input)
 */
export const generateEmbeddings = async (texts, apiKey) => {
  if (!texts || texts.length === 0) return [];

  const model = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const client = getOpenRouter(apiKey);

  let response;
  try {
    response = await client.embeddings.create({
      model,
      input: texts
    });
  } catch (apiError) {
    // Some OpenRouter API keys may not have access to embedding models
    logger.warn('Batch embedding API call failed', {
      model,
      textsCount: texts.length,
      error: apiError.message,
      status: apiError.status || apiError.code,
      type: apiError.type
    });
    throw new Error(`Batch embedding API error: ${apiError.message}`);
  }

  if (!response.data || !Array.isArray(response.data)) {
    logger.warn('Unexpected batch embedding response format', {
      model,
      textsCount: texts.length,
      hasData: !!response.data,
      dataType: typeof response.data,
      responseKeys: response ? Object.keys(response) : 'null',
      responsePreview: JSON.stringify(response).substring(0, 500)
    });
    throw new Error('Invalid batch embedding response: missing data array');
  }

  // Sort by index to ensure order matches input
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map(item => item.embedding);
};

/**
 * Get (or generate and cache) the embedding for a user's criteria.
 * Uses in-memory cache with hash-based invalidation.
 * @param {string} userId - User identifier
 * @param {string} userCriteria - User's lead search criteria text
 * @param {string} apiKey - OpenRouter API key
 * @returns {number[]} Embedding vector for the criteria
 */
export const getCriteriaEmbedding = async (userId, userCriteria, apiKey) => {
  const promptHash = hashText(userCriteria);
  const cached = criteriaEmbeddingCache.get(userId);

  if (cached && cached.promptHash === promptHash) {
    logger.debug('Using cached criteria embedding', { userId });
    return cached.embedding;
  }

  logger.info('Generating new criteria embedding', {
    userId,
    criteriaLength: userCriteria.length,
    cacheHit: false
  });

  // Extract the "positive" part of criteria for embedding
  // We want to match against what the user IS looking for, not exclusions
  const positiveCriteria = extractPositiveCriteria(userCriteria);

  const embedding = await generateEmbedding(positiveCriteria, apiKey);

  // Cache it
  criteriaEmbeddingCache.set(userId, {
    embedding,
    promptHash
  });

  logger.info('Criteria embedding cached', {
    userId,
    embeddingDimensions: embedding.length
  });

  return embedding;
};

/**
 * Extract the positive/search criteria from user prompt.
 * Removes "НЕ СЧИТАТЬ ЛИДОМ" and similar exclusion sections
 * so the embedding focuses on what we're looking for.
 * @param {string} criteria - Full user criteria text
 * @returns {string} Positive criteria only
 */
const extractPositiveCriteria = (criteria) => {
  // Common section markers for exclusions in Russian prompts
  const exclusionMarkers = [
    'НЕ СЧИТАТЬ ЛИДОМ',
    'НЕ ИСКАТЬ',
    'ИСКЛЮЧЕНИЯ',
    'МИНУС-СЛОВА',
    'СТОП-СЛОВА',
    'КОГО НЕ ИСКАТЬ',
    'НЕ ПОДХОДЯТ',
    'ИГНОРИРОВАТЬ'
  ];

  let positive = criteria;

  for (const marker of exclusionMarkers) {
    const markerIndex = positive.toUpperCase().indexOf(marker);
    if (markerIndex !== -1) {
      // Find the next section header (line starting with uppercase or bullet) or end of text
      const afterMarker = positive.substring(markerIndex);
      const lines = afterMarker.split('\n');

      // Find where the exclusion section ends (next major header or end)
      let exclusionEnd = afterMarker.length;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect next section: starts with a known positive header pattern
        if (line.match(/^(КОГО ИЩЕМ|ЧТО УПОМИНАЮТ|КЛЮЧЕВЫЕ|ЦЕЛЕВАЯ|ПОЗИТИВНЫЕ|КТО НАМ НУЖЕН)/i)) {
          exclusionEnd = lines.slice(0, i).join('\n').length;
          break;
        }
      }

      // Remove the exclusion section
      positive = positive.substring(0, markerIndex) + positive.substring(markerIndex + exclusionEnd);
    }
  }

  // Clean up extra whitespace
  positive = positive.replace(/\n{3,}/g, '\n\n').trim();

  // Fallback: if we accidentally removed everything, use original
  if (positive.length < 20) {
    return criteria;
  }

  return positive;
};

/**
 * Clear cached embedding for a specific user (e.g. when criteria change).
 * @param {string} userId
 */
export const clearCriteriaCache = (userId) => {
  criteriaEmbeddingCache.delete(userId);
  logger.debug('Cleared criteria embedding cache', { userId });
};

/**
 * Clear all cached embeddings (e.g. on server restart).
 */
export const clearAllCache = () => {
  criteriaEmbeddingCache.clear();
  logger.debug('Cleared all criteria embedding caches');
};

/**
 * Get cache stats for monitoring.
 * @returns {object} Cache statistics
 */
export const getCacheStats = () => {
  return {
    cachedUsers: criteriaEmbeddingCache.size,
    userIds: Array.from(criteriaEmbeddingCache.keys())
  };
};

export default {
  cosineSimilarity,
  generateEmbedding,
  generateEmbeddings,
  getCriteriaEmbedding,
  isApiKeyBlocked,
  markApiKeyFailed,
  clearCriteriaCache,
  clearAllCache,
  getCacheStats
};
