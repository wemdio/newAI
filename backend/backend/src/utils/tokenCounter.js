/**
 * Token counter utility for cost estimation
 * Uses approximate counting based on character length
 * More accurate than nothing, less accurate than tiktoken
 */

/**
 * Estimate tokens in text
 * Rule of thumb: ~4 characters = 1 token for English text
 * @param {string} text - Text to count tokens for
 * @returns {number} Estimated token count
 */
export const estimateTokens = (text) => {
  if (!text || typeof text !== 'string') return 0;
  
  // Basic approximation: 1 token ≈ 4 characters
  // This is more accurate for English text
  const charCount = text.length;
  const estimatedTokens = Math.ceil(charCount / 4);
  
  // Add buffer for special tokens and formatting
  return Math.ceil(estimatedTokens * 1.1);
};

/**
 * Calculate cost for OpenRouter API call
 * Claude 3 Haiku: $0.25/1M input tokens, $1.25/1M output tokens
 * Gemini 2.0 Flash: $0.10/1M input tokens, $0.40/1M output tokens
 * Gemini 3 Pro Preview: $2/M input tokens, $12/M output tokens
 */
export const calculateCost = (inputTokens, outputTokens, model = 'anthropic/claude-3-haiku') => {
  const costs = {
    // Claude 3 Haiku - best balance of quality and cost
    'anthropic/claude-3-haiku': {
      input: 0.25 / 1_000_000,  // $0.25 per 1M tokens
      output: 1.25 / 1_000_000   // $1.25 per 1M tokens
    },
    // Gemini models
    'gemini-2.0-flash': {
      input: 0.10 / 1_000_000,  // $0.10 per 1M tokens
      output: 0.40 / 1_000_000   // $0.40 per 1M tokens
    },
    'google/gemini-2.0-flash-001': {
      input: 0.10 / 1_000_000,  // $0.10 per 1M tokens
      output: 0.40 / 1_000_000   // $0.40 per 1M tokens
    },
    'google/gemini-3-pro-preview': {
      input: 2.00 / 1_000_000,  // $2.00 per 1M tokens
      output: 12.00 / 1_000_000  // $12.00 per 1M tokens
    },
    'openai/gpt-5.2-chat': {
      input: 1.75 / 1_000_000,  // $1.75 per 1M tokens
      output: 14.00 / 1_000_000  // $14.00 per 1M tokens
    },
    'openai/gpt-4o-mini': {
      input: 0.15 / 1_000_000,
      output: 0.60 / 1_000_000
    },
    'google/gemini-2.5-pro': {
      input: 1.25 / 1_000_000,
      output: 10.00 / 1_000_000
    },
    'google/gemini-2.0-flash-exp': {
      input: 0,
      output: 0
    },
    'google/gemini-2.0-flash-thinking-exp:free': {
      input: 0, // Free on OpenRouter
      output: 0
    }
  };
  
  const modelCosts = costs[model] || costs['anthropic/claude-3-haiku'];
  
  const inputCost = inputTokens * modelCosts.input;
  const outputCost = outputTokens * modelCosts.output;
  const totalCost = inputCost + outputCost;
  
  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
};

/**
 * Estimate cost before making API call
 */
export const estimateCost = (systemPrompt, userPrompt, expectedOutputLength = 500) => {
  const inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
  const outputTokens = estimateTokens(' '.repeat(expectedOutputLength));
  
  return calculateCost(inputTokens, outputTokens);
};

/**
 * Format cost for display
 */
export const formatCost = (cost) => {
  if (cost < 0.000001) return '$0.000001';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
};

/**
 * Calculate cost for batch processing
 */
export const calculateBatchCost = (messagesCount, avgMessageLength = 200) => {
  // Estimate system prompt size (roughly 300 tokens)
  const systemPromptTokens = 300;
  
  // Estimate per-message tokens
  const avgUserPromptTokens = estimateTokens(' '.repeat(avgMessageLength)) + 100; // +100 for metadata
  
  // Estimate output tokens per message (JSON response ~150 tokens)
  const avgOutputTokens = 150;
  
  const totalInputTokens = (systemPromptTokens + avgUserPromptTokens) * messagesCount;
  const totalOutputTokens = avgOutputTokens * messagesCount;
  
  return calculateCost(totalInputTokens, totalOutputTokens);
};

/**
 * Check if cost is within budget
 */
export const isWithinBudget = (estimatedCost, remainingBudget) => {
  return estimatedCost <= remainingBudget;
};

/**
 * Calculate messages that can be processed with remaining budget
 */
export const calculateMessagesInBudget = (remainingBudget, avgMessageLength = 200) => {
  const singleMessageCost = calculateBatchCost(1, avgMessageLength).totalCost;
  const messagesCount = Math.floor(remainingBudget / singleMessageCost);
  
  return Math.max(0, messagesCount);
};

export default {
  estimateTokens,
  calculateCost,
  estimateCost,
  formatCost,
  calculateBatchCost,
  isWithinBudget,
  calculateMessagesInBudget
};

