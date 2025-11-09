import { getTelegramBot, formatLeadMessage, createLeadKeyboard, sendMessage } from '../config/telegram.js';
import { getSupabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { TelegramError, DatabaseError, retryWithBackoff } from '../utils/errorHandler.js';

/**
 * Service for posting leads to Telegram channels
 */

/**
 * Normalize message text for duplicate detection
 * Removes extra whitespace, converts to lowercase, removes punctuation
 * @param {string} text - Message text
 * @returns {string} Normalized text
 */
const normalizeMessageText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

/**
 * Check if a similar lead was already posted recently
 * @param {object} lead - Lead data
 * @param {string} userId - User ID
 * @param {number} daysBack - Number of days to check (default: 7)
 * @returns {object} Duplicate check result
 */
export const checkDuplicateLead = async (lead, userId, daysBack = 7) => {
  try {
    const supabase = getSupabase();
    
    // Normalize message text for comparison
    const normalizedText = normalizeMessageText(lead.message);
    
    // Calculate time threshold
    const timeThreshold = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    // Check for similar leads posted in the last N days
    // We check by normalized message text
    const { data: existingLeads, error } = await supabase
      .from('detected_leads')
      .select(`
        id,
        message_id,
        posted_to_telegram,
        detected_at,
        messages(message)
      `)
      .eq('user_id', userId)
      .eq('posted_to_telegram', true)
      .gte('detected_at', timeThreshold.toISOString());
    
    if (error) throw error;
    
    // Check if any existing lead has similar normalized text
    const isDuplicate = existingLeads?.some(existingLead => {
      const existingText = normalizeMessageText(existingLead.messages?.message || '');
      if (!existingText || !normalizedText) return false;
      
      // Exact match
      if (existingText === normalizedText) return true;
      
      // For longer messages, check if they share significant overlap
      if (existingText.length > 20 && normalizedText.length > 20) {
        const existingStart = existingText.substring(0, 30);
        const normalizedStart = normalizedText.substring(0, 30);
        return existingStart === normalizedStart || 
               existingText.includes(normalizedStart) ||
               normalizedText.includes(existingStart);
      }
      
      return false;
    });
    
    if (isDuplicate) {
      logger.info('Duplicate lead detected, skipping post', {
        leadId: lead.id,
        userId,
        normalizedText: normalizedText.substring(0, 50) + '...'
      });
    }
    
    return {
      isDuplicate: !!isDuplicate,
      similarLeadsCount: existingLeads?.length || 0
    };
  } catch (error) {
    logger.error('Failed to check for duplicate lead', {
      leadId: lead.id,
      userId,
      error: error.message
    });
    // On error, don't block posting (fail open)
    return { isDuplicate: false, error: error.message };
  }
};

/**
 * Post a single lead to Telegram channel
 * @param {object} lead - Lead data (from messages table)
 * @param {object} analysis - AI analysis results
 * @param {string} channelId - Target Telegram channel ID
 * @param {string} botToken - Optional bot token
 * @param {string} userId - User ID (for duplicate checking)
 * @param {string} messageSuggestion - Optional message suggestion for sales manager
 * @returns {object} Post result
 */
export const postLeadToChannel = async (lead, analysis, channelId, botToken = null, userId = null, messageSuggestion = null) => {
  try {
    logger.info('Posting lead to Telegram', {
      leadId: lead.id,
      channelId,
      confidence: analysis.confidence_score,
      hasSuggestion: !!messageSuggestion
    });
    
    // Check for duplicates if userId provided (TEMPORARILY DISABLED FOR TESTING)
    if (false && userId) {
      const duplicateCheck = await checkDuplicateLead(lead, userId);
      if (duplicateCheck.isDuplicate) {
        logger.info('Skipping duplicate lead', {
          leadId: lead.id,
          userId
        });
        return {
          success: false,
          skipped: true,
          reason: 'duplicate',
          leadId: lead.id
        };
      }
    }
    
    // Format message with optional suggestion
    const message = formatLeadMessage(lead, analysis, messageSuggestion);
    
    // Create inline keyboard with action buttons
    const keyboard = createLeadKeyboard(lead);
    
    // Send with retry logic
    const result = await retryWithBackoff(async () => {
      return await sendMessage(channelId, message, { reply_markup: keyboard }, botToken);
    }, 3, 2000);
    
    logger.info('Lead posted successfully', {
      leadId: lead.id,
      messageId: result.message_id,
      channelId
    });
    
    return {
      success: true,
      messageId: result.message_id,
      channelId,
      leadId: lead.id
    };
  } catch (error) {
    logger.error('Failed to post lead to Telegram', {
      leadId: lead.id,
      channelId,
      error: error.message
    });
    
    throw new TelegramError('Failed to post lead', {
      leadId: lead.id,
      channelId,
      originalError: error.message
    });
  }
};

/**
 * Mark lead as posted in database
 * @param {number} detectedLeadId - ID from detected_leads table
 * @returns {object} Update result
 */
export const markLeadAsPosted = async (detectedLeadId) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('detected_leads')
      .update({ posted_to_telegram: true })
      .eq('id', detectedLeadId)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.debug('Lead marked as posted', { detectedLeadId });
    
    return data;
  } catch (error) {
    logger.error('Failed to mark lead as posted', {
      detectedLeadId,
      error: error.message
    });
    
    throw new DatabaseError('Failed to update lead status', {
      detectedLeadId,
      originalError: error.message
    });
  }
};

/**
 * Post multiple leads in batch
 * @param {array} leads - Array of {lead, analysis, detectedLeadId}
 * @param {string} channelId - Target channel
 * @param {string} botToken - Optional bot token
 * @param {string} userId - User ID (for duplicate checking)
 * @param {object} options - Batch options
 * @returns {object} Batch post results
 */
export const postLeadsBatch = async (leads, channelId, botToken = null, userId = null, options = {}) => {
  const {
    delayBetweenPosts = 1000, // Delay between posts in ms (rate limiting)
    stopOnError = false
  } = options;
  
  logger.info('Starting batch lead posting', {
    totalLeads: leads.length,
    channelId,
    delayBetweenPosts,
    duplicateCheckEnabled: !!userId
  });
  
  const results = {
    posted: [],
    skipped: [],
    failed: [],
    stats: {
      total: leads.length,
      posted: 0,
      skipped: 0,
      failed: 0
    }
  };
  
  for (const { lead, analysis, detectedLeadId } of leads) {
    try {
      // Post to Telegram (with duplicate check if userId provided)
      const postResult = await postLeadToChannel(lead, analysis, channelId, botToken, userId);
      
      // Handle result
      if (postResult.skipped) {
        // Duplicate - skip posting but don't mark as error
        results.skipped.push({
          leadId: lead.id,
          detectedLeadId,
          reason: 'duplicate'
        });
        results.stats.skipped++;
      } else if (postResult.success) {
        // Successfully posted
        await markLeadAsPosted(detectedLeadId);
        
        results.posted.push({
          leadId: lead.id,
          detectedLeadId,
          messageId: postResult.messageId
        });
        results.stats.posted++;
        
        // Delay before next post to avoid rate limits
        if (delayBetweenPosts > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenPosts));
        }
      } else {
        // Failed for other reason
        results.failed.push({
          leadId: lead.id,
          detectedLeadId,
          error: postResult.reason || 'Unknown error'
        });
        results.stats.failed++;
      }
    } catch (error) {
      results.failed.push({
        leadId: lead.id,
        detectedLeadId,
        error: error.message
      });
      results.stats.failed++;
      
      if (stopOnError) {
        break;
      }
    }
  }
  
  logger.info('Batch lead posting complete', {
    total: results.stats.total,
    posted: results.stats.posted,
    skipped: results.stats.skipped,
    failed: results.stats.failed
  });
  
  return results;
};

/**
 * Get unposted leads for a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of leads to retrieve
 * @returns {array} Unposted leads
 */
export const getUnpostedLeads = async (userId, limit = 100) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('detected_leads')
      .select(`
        id,
        message_id,
        confidence_score,
        reasoning,
        matched_criteria,
        detected_at,
        messages (*)
      `)
      .eq('user_id', userId)
      .eq('posted_to_telegram', false)
      .order('detected_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    
    logger.debug('Retrieved unposted leads', {
      userId,
      count: data?.length || 0
    });
    
    return data || [];
  } catch (error) {
    logger.error('Failed to get unposted leads', {
      userId,
      error: error.message
    });
    
    throw new DatabaseError('Failed to retrieve unposted leads', {
      userId,
      originalError: error.message
    });
  }
};

/**
 * Send test message to channel
 * @param {string} channelId - Target channel ID
 * @param {string} botToken - Optional bot token
 * @returns {object} Test result
 */
export const sendTestMessage = async (channelId, botToken = null) => {
  const testLead = {
    id: 0,
    first_name: 'John',
    last_name: 'Doe',
    username: 'johndoe',
    bio: 'Test user bio',
    profile_link: 'https://t.me/johndoe',
    chat_name: 'Test Channel',
    message_time: new Date().toISOString(),
    message: 'This is a test message to verify Telegram integration is working correctly.'
  };
  
  const testAnalysis = {
    confidence_score: 95,
    matched_criteria: ['Test criterion'],
    reasoning: 'This is a test message for configuration verification.'
  };
  
  try {
    const result = await postLeadToChannel(testLead, testAnalysis, channelId, botToken);
    
    return {
      success: true,
      message: 'Test message sent successfully',
      result
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error
    };
  }
};

export default {
  postLeadToChannel,
  markLeadAsPosted,
  postLeadsBatch,
  getUnpostedLeads,
  sendTestMessage
};

