import { getActiveUserConfigs } from '../database/queries.js';
import { detectLeads, logProcessingResults } from '../services/leadDetector.js';
import { postLeadsBatch, getUnpostedLeads } from '../services/telegramPoster.js';
import logger from '../utils/logger.js';

/**
 * Hourly lead scanning job
 * Processes messages for all active users
 */

/**
 * Process leads for a single user
 * @param {object} userConfig - User configuration
 * @returns {object} Processing results
 */
export const processUserLeads = async (userConfig) => {
  const userId = userConfig.user_id;
  
  try {
    logger.info('Processing leads for user', { 
      userId,
      isActive: userConfig.is_active 
    });
    
    // Step 1: Detect leads
    const detectionResults = await detectLeads(userId, userConfig, {
      hoursBack: 1,
      maxMessages: parseInt(process.env.MAX_MESSAGES_PER_HOUR) || 10000
    });
    
    // Step 2: Log results
    await logProcessingResults(userId, detectionResults);
    
    // Step 3: Post leads to Telegram if any found
    if (detectionResults.leadsDetected > 0) {
      logger.info('Posting leads to Telegram', {
        userId,
        leadsCount: detectionResults.leadsDetected
      });
      
      // Prepare leads for posting
      const leadsToPost = detectionResults.leads.map(lead => ({
        lead: lead.message,
        analysis: lead.analysis,
        detectedLeadId: lead.detectedLeadId
      }));
      
      // Post to Telegram
      const postResults = await postLeadsBatch(
        leadsToPost,
        userConfig.telegram_channel_id,
        null, // Use default bot token
        userId, // userId for duplicate checking
        { delayBetweenPosts: 1000 } // 1 second delay
      );
      
      logger.info('Telegram posting complete', {
        userId,
        posted: postResults.stats.posted,
        failed: postResults.stats.failed
      });
      
      return {
        success: true,
        detection: detectionResults,
        posting: postResults
      };
    } else {
      logger.info('No leads found for user', { userId });
      
      return {
        success: true,
        detection: detectionResults,
        posting: null
      };
    }
    
  } catch (error) {
    logger.error('Failed to process user leads', {
      userId,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      userId,
      error: error.message
    };
  }
};

/**
 * Main hourly scan job
 * Processes all active users
 * @returns {object} Job results
 */
export const runHourlyScan = async () => {
  const startTime = Date.now();
  
  logger.info('====== STARTING HOURLY LEAD SCAN ======');
  
  const results = {
    startTime: new Date().toISOString(),
    usersProcessed: 0,
    usersSucceeded: 0,
    usersFailed: 0,
    totalLeadsDetected: 0,
    totalLeadsPosted: 0,
    errors: [],
    userResults: []
  };
  
  try {
    // Get all active user configurations
    const activeUsers = await getActiveUserConfigs();
    
    logger.info(`Found ${activeUsers.length} active users to process`);
    
    if (activeUsers.length === 0) {
      logger.info('No active users to process');
      results.duration = Date.now() - startTime;
      return results;
    }
    
    // Process each user sequentially (can be made parallel if needed)
    for (const userConfig of activeUsers) {
      results.usersProcessed++;
      
      const userResult = await processUserLeads(userConfig);
      results.userResults.push(userResult);
      
      if (userResult.success) {
        results.usersSucceeded++;
        results.totalLeadsDetected += userResult.detection.leadsDetected;
        
        if (userResult.posting) {
          results.totalLeadsPosted += userResult.posting.stats.posted;
        }
      } else {
        results.usersFailed++;
        results.errors.push({
          userId: userConfig.user_id,
          error: userResult.error
        });
      }
      
      // Small delay between users to avoid overwhelming services
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    results.duration = Date.now() - startTime;
    
    logger.info('====== HOURLY SCAN COMPLETE ======', {
      duration: `${results.duration}ms`,
      usersProcessed: results.usersProcessed,
      usersSucceeded: results.usersSucceeded,
      usersFailed: results.usersFailed,
      totalLeadsDetected: results.totalLeadsDetected,
      totalLeadsPosted: results.totalLeadsPosted
    });
    
    return results;
    
  } catch (error) {
    results.duration = Date.now() - startTime;
    results.errors.push({
      type: 'job_error',
      error: error.message
    });
    
    logger.error('====== HOURLY SCAN FAILED ======', {
      duration: `${results.duration}ms`,
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
};

/**
 * Retry unposted leads
 * Attempts to post any leads that failed to post previously
 * @returns {object} Retry results
 */
export const retryUnpostedLeads = async () => {
  logger.info('Starting retry of unposted leads');
  
  const results = {
    usersProcessed: 0,
    totalRetried: 0,
    totalPosted: 0,
    errors: []
  };
  
  try {
    const activeUsers = await getActiveUserConfigs();
    
    for (const userConfig of activeUsers) {
      try {
        // Get unposted leads for this user
        const unpostedLeads = await getUnpostedLeads(userConfig.user_id, 50);
        
        if (unpostedLeads.length === 0) continue;
        
        results.usersProcessed++;
        results.totalRetried += unpostedLeads.length;
        
        logger.info('Retrying unposted leads for user', {
          userId: userConfig.user_id,
          count: unpostedLeads.length
        });
        
        // Format for posting
        const leadsToPost = unpostedLeads.map(lead => ({
          lead: lead.messages,
          analysis: {
            confidence_score: lead.confidence_score,
            reasoning: lead.reasoning,
            matched_criteria: lead.matched_criteria
          },
          detectedLeadId: lead.id
        }));
        
        // Post to Telegram
        const postResults = await postLeadsBatch(
          leadsToPost,
          userConfig.telegram_channel_id,
          null, // botToken
          userConfig.user_id, // userId for duplicate checking
          { delayBetweenPosts: 1000 }
        );
        
        results.totalPosted += postResults.stats.posted;
        
      } catch (error) {
        results.errors.push({
          userId: userConfig.user_id,
          error: error.message
        });
        
        logger.error('Failed to retry leads for user', {
          userId: userConfig.user_id,
          error: error.message
        });
      }
    }
    
    logger.info('Retry unposted leads complete', results);
    
    return results;
    
  } catch (error) {
    logger.error('Retry unposted leads job failed', {
      error: error.message
    });
    
    throw error;
  }
};

export default {
  processUserLeads,
  runHourlyScan,
  retryUnpostedLeads
};

