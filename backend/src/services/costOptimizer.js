import { getSupabase } from '../config/database.js';
import { calculateBatchCost, calculateMessagesInBudget, formatCost } from '../utils/tokenCounter.js';
import logger from '../utils/logger.js';
import { DatabaseError } from '../utils/errorHandler.js';

/**
 * Cost tracking and optimization service
 * Monitors API usage and enforces budget limits
 */

/**
 * Record API usage in database
 * @param {string} userId - User ID
 * @param {object} usageData - Usage data (cost, tokens, model)
 * @returns {object} Recorded usage
 */
export const recordUsage = async (userId, usageData) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('api_usage')
      .insert({
        user_id: userId,
        cost: usageData.cost,
        input_tokens: usageData.inputTokens,
        output_tokens: usageData.outputTokens,
        model_used: usageData.model || 'anthropic/claude-3-haiku'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    logger.debug('Recorded API usage', {
      userId,
      cost: formatCost(usageData.cost),
      tokens: usageData.inputTokens + usageData.outputTokens
    });
    
    return data;
  } catch (error) {
    logger.error('Failed to record API usage', {
      userId,
      error: error.message
    });
    throw new DatabaseError('Failed to record usage', { originalError: error.message });
  }
};

/**
 * Get total usage for a user in current month
 * @param {string} userId - User ID
 * @returns {object} Usage summary
 */
export const getMonthlyUsage = async (userId) => {
  try {
    const supabase = getSupabase();
    
    // Get start of current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data, error } = await supabase
      .from('api_usage')
      .select('cost, input_tokens, output_tokens, model_used, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', monthStart)
      .order('timestamp', { ascending: false });
    
    if (error) throw error;
    
    // Calculate totals
    const summary = {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: data?.length || 0,
      calls: data || []
    };
    
    if (data && data.length > 0) {
      summary.totalCost = data.reduce((sum, record) => sum + parseFloat(record.cost), 0);
      summary.totalInputTokens = data.reduce((sum, record) => sum + record.input_tokens, 0);
      summary.totalOutputTokens = data.reduce((sum, record) => sum + record.output_tokens, 0);
    }
    
    return summary;
  } catch (error) {
    logger.error('Failed to get monthly usage', {
      userId,
      error: error.message
    });
    throw new DatabaseError('Failed to get usage', { originalError: error.message });
  }
};

/**
 * Check if user is within budget
 * @param {string} userId - User ID
 * @param {number} additionalCost - Additional cost to check
 * @returns {object} Budget check result
 */
export const checkBudget = async (userId, additionalCost = 0) => {
  try {
    const monthlyLimit = parseFloat(process.env.MONTHLY_BUDGET_USD) || 50;
    const monthlyUsage = await getMonthlyUsage(userId);
    
    const currentSpend = monthlyUsage.totalCost;
    const projectedSpend = currentSpend + additionalCost;
    const remainingBudget = monthlyLimit - currentSpend;
    const withinBudget = projectedSpend <= monthlyLimit;
    
    const result = {
      withinBudget,
      currentSpend,
      projectedSpend: additionalCost > 0 ? projectedSpend : null,
      remainingBudget,
      monthlyLimit,
      percentUsed: Math.round((currentSpend / monthlyLimit) * 100)
    };
    
    if (!withinBudget) {
      logger.warn('Budget limit exceeded', {
        userId,
        currentSpend: formatCost(currentSpend),
        monthlyLimit: formatCost(monthlyLimit),
        additionalCost: formatCost(additionalCost)
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to check budget', {
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Estimate cost for processing messages
 * @param {number} messageCount - Number of messages to process
 * @param {number} avgMessageLength - Average message length
 * @returns {object} Cost estimate
 */
export const estimateProcessingCost = (messageCount, avgMessageLength = 200) => {
  const costEstimate = calculateBatchCost(messageCount, avgMessageLength);
  
  return {
    messageCount,
    estimatedCost: costEstimate.totalCost,
    estimatedInputTokens: costEstimate.inputTokens,
    estimatedOutputTokens: costEstimate.outputTokens,
    costPerMessage: costEstimate.totalCost / messageCount,
    formatted: {
      totalCost: formatCost(costEstimate.totalCost),
      costPerMessage: formatCost(costEstimate.totalCost / messageCount)
    }
  };
};

/**
 * Calculate how many messages can be processed with remaining budget
 * @param {string} userId - User ID
 * @returns {object} Messages that can be processed
 */
export const getProcessingCapacity = async (userId) => {
  try {
    const budgetCheck = await checkBudget(userId);
    
    if (budgetCheck.remainingBudget <= 0) {
      return {
        canProcess: 0,
        remainingBudget: 0,
        message: 'Monthly budget limit reached'
      };
    }
    
    const messagesInBudget = calculateMessagesInBudget(budgetCheck.remainingBudget);
    
    return {
      canProcess: messagesInBudget,
      remainingBudget: budgetCheck.remainingBudget,
      formatted: {
        remainingBudget: formatCost(budgetCheck.remainingBudget)
      }
    };
  } catch (error) {
    logger.error('Failed to get processing capacity', {
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Optimize batch size based on budget
 * @param {string} userId - User ID
 * @param {number} totalMessages - Total messages to process
 * @returns {object} Optimized batch configuration
 */
export const optimizeBatchSize = async (userId, totalMessages) => {
  try {
    const capacity = await getProcessingCapacity(userId);
    
    // If no budget remaining, return 0
    if (capacity.canProcess === 0) {
      return {
        shouldProcess: false,
        batchSize: 0,
        totalBatches: 0,
        messagesProcessed: 0,
        messagesSkipped: totalMessages,
        reason: 'Budget limit reached'
      };
    }
    
    // Determine how many messages to process
    const messagesToProcess = Math.min(totalMessages, capacity.canProcess);
    const messagesSkipped = totalMessages - messagesToProcess;
    
    // Calculate batch size (process in chunks of 50 max)
    const maxBatchSize = 50;
    const batchSize = Math.min(messagesToProcess, maxBatchSize);
    const totalBatches = Math.ceil(messagesToProcess / batchSize);
    
    return {
      shouldProcess: true,
      batchSize,
      totalBatches,
      messagesProcessed: messagesToProcess,
      messagesSkipped,
      estimatedCost: estimateProcessingCost(messagesToProcess)
    };
  } catch (error) {
    logger.error('Failed to optimize batch size', {
      userId,
      totalMessages,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get usage statistics for user
 * @param {string} userId - User ID
 * @param {number} days - Number of days to look back
 * @returns {object} Usage statistics
 */
export const getUsageStatistics = async (userId, days = 30) => {
  try {
    const supabase = getSupabase();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('api_usage')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: true });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return {
        totalCost: 0,
        totalCalls: 0,
        averageCostPerCall: 0,
        dailyAverage: 0,
        byDay: []
      };
    }
    
    // Calculate totals
    const totalCost = data.reduce((sum, record) => sum + parseFloat(record.cost), 0);
    const totalCalls = data.length;
    const averageCostPerCall = totalCost / totalCalls;
    
    // Group by day
    const byDay = {};
    data.forEach(record => {
      const day = new Date(record.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { cost: 0, calls: 0, tokens: 0 };
      }
      byDay[day].cost += parseFloat(record.cost);
      byDay[day].calls += 1;
      byDay[day].tokens += record.input_tokens + record.output_tokens;
    });
    
    const dailyAverage = totalCost / days;
    
    return {
      totalCost,
      totalCalls,
      averageCostPerCall,
      dailyAverage,
      byDay,
      formatted: {
        totalCost: formatCost(totalCost),
        averageCostPerCall: formatCost(averageCostPerCall),
        dailyAverage: formatCost(dailyAverage)
      }
    };
  } catch (error) {
    logger.error('Failed to get usage statistics', {
      userId,
      error: error.message
    });
    throw error;
  }
};

export default {
  recordUsage,
  getMonthlyUsage,
  checkBudget,
  estimateProcessingCost,
  getProcessingCapacity,
  optimizeBatchSize,
  getUsageStatistics
};

