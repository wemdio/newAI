import { getSupabase } from '../config/database.js';
import { preFilterMessages } from '../validators/messagePreFilter.js';
import { analyzeBatch } from './messageAnalyzer.js';
import { optimizeBatchSize, recordUsage } from './costOptimizer.js';
import logger from '../utils/logger.js';
import { DatabaseError } from '../utils/errorHandler.js';

/**
 * Lead detection orchestrator
 * Coordinates the entire lead detection pipeline
 */

/**
 * Fetch messages from last hour (with pagination for large datasets)
 * @param {object} options - Query options
 * @returns {array} Messages from last hour
 */
export const fetchRecentMessages = async (options = {}) => {
  try {
    const supabase = getSupabase();
    
    const {
      hoursBack = 1,
      limit = null
    } = options;
    
    // Calculate time threshold
    const timeThreshold = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    logger.info('Fetching recent messages', {
      hoursBack,
      timeThreshold: timeThreshold.toISOString(),
      limit: limit || 'unlimited (paginated)'
    });
    
    // If limit is specified, use simple query
    if (limit) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .gte('message_time', timeThreshold.toISOString())
        .order('message_time', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      logger.info('Fetched recent messages (limited)', {
        count: data?.length || 0,
        hoursBack,
        limit
      });
      
      return data || [];
    }
    
    // No limit - use pagination to fetch ALL messages
    // Supabase default limit is 1000, so we need to paginate
    const PAGE_SIZE = 1000;
    let allMessages = [];
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .gte('message_time', timeThreshold.toISOString())
        .order('message_time', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        allMessages = allMessages.concat(data);
        offset += PAGE_SIZE;
        
        // If we got less than PAGE_SIZE, we've reached the end
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        }
        
        logger.debug('Pagination progress', {
          fetched: data.length,
          total: allMessages.length,
          offset
        });
      } else {
        hasMore = false;
      }
      
      // Safety limit to prevent infinite loops (max 100k messages)
      if (allMessages.length >= 100000) {
        logger.warn('Reached safety limit of 100k messages');
        hasMore = false;
      }
    }
    
    logger.info('Fetched recent messages (paginated)', {
      count: allMessages.length,
      hoursBack,
      pages: Math.ceil(allMessages.length / PAGE_SIZE)
    });
    
    return allMessages;
  } catch (error) {
    logger.error('Failed to fetch recent messages', {
      error: error.message
    });
    
    throw new DatabaseError('Failed to fetch messages', {
      originalError: error.message
    });
  }
};

/**
 * Save detected lead to database
 * @param {string} userId - User ID
 * @param {object} message - Original message
 * @param {object} analysis - AI analysis result
 * @returns {object} Saved lead or null if duplicate
 */
export const saveDetectedLead = async (userId, message, analysis) => {
  try {
    const supabase = getSupabase();
    const crypto = await import('crypto');
    
    // Calculate message hash for deduplication
    const messageText = message.message || '';
    const messageHash = crypto.createHash('sha256').update(messageText).digest('hex');
    
    // Use username as sender identifier (this is the actual field in messages table)
    // Fallback to message_hash if no username
    const senderId = message.username || messageHash;
    
    // Check for duplicates in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Build duplicate check query
    let duplicateQuery = supabase
      .from('detected_leads')
      .select('id, detected_at, sender_id')
      .eq('user_id', userId)
      .gte('detected_at', sevenDaysAgo.toISOString());
    
    // If we have a username, check by username
    // Otherwise, check by message_hash to avoid exact duplicate messages
    if (message.username) {
      duplicateQuery = duplicateQuery.eq('sender_id', String(senderId));
    } else {
      // No username - check if we've seen this exact message before
      duplicateQuery = duplicateQuery.eq('message_hash', messageHash);
    }
    
    const { data: existingLeads, error: checkError } = await duplicateQuery.limit(1);
    
    if (checkError) {
      logger.warn('Failed to check for duplicates, proceeding with save', {
        error: checkError.message
      });
    }
    
    if (existingLeads && existingLeads.length > 0) {
      logger.info('Duplicate lead detected - skipping save', {
        userId,
        senderId: message.username ? senderId : 'no_username',
        messageId: message.id,
        existingLeadId: existingLeads[0].id,
        lastDetected: existingLeads[0].detected_at,
        checkType: message.username ? 'by_username' : 'by_message_hash'
      });
      return null; // Skip duplicate
    }
    
    const leadData = {
      user_id: userId,
      message_id: message.id,
      confidence_score: analysis.aiResponse.confidence_score,
      reasoning: analysis.aiResponse.reasoning,
      matched_criteria: analysis.aiResponse.matched_criteria,
      posted_to_telegram: false,
      is_contacted: false,
      message_hash: messageHash,
      sender_id: String(senderId)
    };
    
    const { data, error } = await supabase
      .from('detected_leads')
      .insert(leadData)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info('Saved detected lead', {
      leadId: data.id,
      messageId: message.id,
      userId,
      senderId,
      confidence: analysis.aiResponse.confidence_score
    });
    
    return data;
  } catch (error) {
    logger.error('Failed to save detected lead', {
      userId,
      messageId: message.id,
      error: error.message
    });
    
    throw new DatabaseError('Failed to save lead', {
      userId,
      messageId: message.id,
      originalError: error.message
    });
  }
};

/**
 * Main lead detection pipeline
 * @param {string} userId - User ID
 * @param {object} userConfig - User configuration
 * @param {object} options - Pipeline options
 * @returns {object} Detection results
 */
export const detectLeads = async (userId, userConfig, options = {}) => {
  const startTime = Date.now();
  
  const {
    hoursBack = 1,
    maxMessages = null
  } = options;
  
  logger.info('Starting lead detection pipeline', {
    userId,
    hoursBack,
    maxMessages
  });
  
  const results = {
    messagesFetched: 0,
    messagesPreFiltered: 0,
    messagesAnalyzed: 0,
    leadsDetected: 0,
    totalCost: 0,
    errors: [],
    leads: [],
    duration: 0
  };
  
  try {
    // Step 1: Fetch recent messages
    const messages = await fetchRecentMessages({ hoursBack, limit: maxMessages });
    results.messagesFetched = messages.length;
    
    if (messages.length === 0) {
      logger.info('No messages to process');
      results.duration = Date.now() - startTime;
      return results;
    }
    
    // Step 2: Pre-filter messages
    const preFilterResult = preFilterMessages(messages, userConfig.lead_prompt);
    const filteredMessages = preFilterResult.passed;
    results.messagesPreFiltered = filteredMessages.length;
    
    logger.info('Pre-filtering complete', {
      fetched: messages.length,
      passed: filteredMessages.length,
      filtered: messages.length - filteredMessages.length,
      filterRate: `${Math.round(((messages.length - filteredMessages.length) / messages.length) * 100)}%`
    });
    
    if (filteredMessages.length === 0) {
      logger.info('No messages passed pre-filter');
      results.duration = Date.now() - startTime;
      return results;
    }
    
    // Step 3: Check budget and optimize batch size
    const batchOptimization = await optimizeBatchSize(userId, filteredMessages.length);
    
    if (!batchOptimization.shouldProcess) {
      logger.warn('Budget limit reached, skipping AI analysis', {
        userId,
        reason: batchOptimization.reason
      });
      results.errors.push('Budget limit reached');
      results.duration = Date.now() - startTime;
      return results;
    }
    
    // Limit messages to what we can afford
    const messagesToAnalyze = filteredMessages.slice(0, batchOptimization.messagesProcessed);
    
    logger.info('Budget check complete', {
      canProcess: batchOptimization.messagesProcessed,
      willSkip: batchOptimization.messagesSkipped,
      estimatedCost: batchOptimization.estimatedCost.formatted.totalCost
    });
    
    // Step 4: Analyze with AI
    const analysisResult = await analyzeBatch(
      messagesToAnalyze,
      userConfig.lead_prompt,
      userConfig.openrouter_api_key,
      { maxConcurrent: 3 }
    );
    
    results.messagesAnalyzed = analysisResult.stats.analyzed;
    results.totalCost = analysisResult.stats.totalCost;
    
    // Step 5: Save detected leads
    for (const match of analysisResult.matches) {
      try {
        const savedLead = await saveDetectedLead(userId, match.message, match.analysis);
        
        // Skip if duplicate (savedLead will be null)
        if (!savedLead) {
          logger.info('Skipped duplicate lead', {
            messageId: match.message.id,
            userId
          });
          continue;
        }
        
        results.leads.push({
          detectedLeadId: savedLead.id,
          message: match.message,
          analysis: match.analysis.aiResponse
        });
        
        results.leadsDetected++;
        
        // Record usage for this detection
        await recordUsage(userId, {
          cost: match.analysis.metadata.cost,
          inputTokens: match.analysis.metadata.tokens.input,
          outputTokens: match.analysis.metadata.tokens.output,
          model: match.analysis.metadata.model
        });
      } catch (error) {
        logger.error('Failed to save lead', {
          messageId: match.message.id,
          error: error.message
        });
        results.errors.push(`Failed to save lead for message ${match.message.id}: ${error.message}`);
      }
    }
    
    // Add failed analysis errors
    if (analysisResult.failed.length > 0) {
      results.errors.push(...analysisResult.failed.map(f => 
        `Analysis failed for message ${f.message.id}: ${f.error}`
      ));
    }
    
    results.duration = Date.now() - startTime;
    
    logger.info('Lead detection pipeline complete', {
      userId,
      messagesFetched: results.messagesFetched,
      messagesPreFiltered: results.messagesPreFiltered,
      messagesAnalyzed: results.messagesAnalyzed,
      leadsDetected: results.leadsDetected,
      totalCost: results.totalCost.toFixed(6),
      duration: results.duration
    });
    
    return results;
    
  } catch (error) {
    results.duration = Date.now() - startTime;
    results.errors.push(`Pipeline error: ${error.message}`);
    
    logger.error('Lead detection pipeline failed', {
      userId,
      error: error.message,
      duration: results.duration
    });
    
    throw error;
  }
};

/**
 * Log processing results to database
 * @param {string} userId - User ID
 * @param {object} results - Processing results
 */
export const logProcessingResults = async (userId, results) => {
  try {
    const supabase = getSupabase();
    
    const logData = {
      user_id: userId,
      messages_fetched: results.messagesFetched,
      messages_analyzed: results.messagesAnalyzed,
      messages_skipped: results.messagesFetched - results.messagesAnalyzed,
      leads_found: results.leadsDetected,
      processing_duration_ms: results.duration,
      errors: results.errors.length > 0 ? results.errors : null
    };
    
    const { error } = await supabase
      .from('processing_logs')
      .insert(logData);
    
    if (error) throw error;
    
    logger.debug('Logged processing results', { userId });
  } catch (error) {
    logger.error('Failed to log processing results', {
      userId,
      error: error.message
    });
    // Don't throw - this is just logging
  }
};

/**
 * Get processing history for user
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to fetch
 * @returns {array} Processing history
 */
export const getProcessingHistory = async (userId, limit = 50) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('processing_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error('Failed to get processing history', {
      userId,
      error: error.message
    });
    
    throw new DatabaseError('Failed to get processing history', {
      userId,
      originalError: error.message
    });
  }
};

export default {
  fetchRecentMessages,
  saveDetectedLead,
  detectLeads,
  logProcessingResults,
  getProcessingHistory
};

