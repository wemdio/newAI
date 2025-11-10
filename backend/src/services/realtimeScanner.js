import { getSupabase } from '../config/database.js';
import { getActiveUserConfigs } from '../database/queries.js';
import { preFilterMessages } from '../validators/messagePreFilter.js';
import { analyzeBatch } from './messageAnalyzer.js';
import { saveDetectedLead } from './leadDetector.js';
import { postLeadToChannel, markLeadAsPosted } from './telegramPoster.js';
import { generateMessageSuggestion } from './messageSuggestion.js';
import logger from '../utils/logger.js';

/**
 * Real-time message scanner using Supabase Realtime
 * Analyzes messages immediately as they are inserted
 */

let realtimeChannel = null;
let isRunning = false;
let subscribedAt = null;
let processedMessageIds = new Set();
const BATCH_INTERVAL = 5000; // 5 seconds
let pendingMessages = [];
let batchTimer = null;

/**
 * Process a batch of new messages
 */
const processBatch = async () => {
  if (pendingMessages.length === 0) return;

  const messagesToProcess = [...pendingMessages];
  pendingMessages = [];

  logger.info('Processing batch of new messages', {
    count: messagesToProcess.length
  });

  try {
    // Get active user configs
    const activeUsers = await getActiveUserConfigs();

    if (activeUsers.length === 0) {
      logger.info('No active users to process messages for');
      return;
    }

    // Process for each active user
    for (const userConfig of activeUsers) {
      try {
        await processMessagesForUser(messagesToProcess, userConfig);
      } catch (error) {
        logger.error('Failed to process messages for user', {
          userId: userConfig.user_id,
          error: error.message
        });
      }
    }
  } catch (error) {
    logger.error('Failed to process message batch', {
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Process messages for a single user
 */
const processMessagesForUser = async (messages, userConfig) => {
  const userId = userConfig.user_id;

  try {
    // Pre-filter messages
    const preFilterResult = preFilterMessages(
      messages,
      userConfig.lead_prompt
    );

    if (preFilterResult.passed.length === 0) {
      logger.info('No messages passed pre-filter', {
        userId,
        total: messages.length
      });
      return;
    }

    logger.info('Messages passed pre-filter', {
      userId,
      passed: preFilterResult.passed.length,
      total: messages.length
    });

    // Debug: log what we're about to send to AI
    logger.info('About to analyze with AI', {
      userId,
      messagesCount: preFilterResult.passed.length,
      hasApiKey: !!userConfig.openrouter_api_key,
      hasPrompt: !!userConfig.lead_prompt
    });

    // Analyze with AI
    let analysisResults;
    try {
      analysisResults = await analyzeBatch(
        preFilterResult.passed,
        userConfig.lead_prompt,
        userConfig.openrouter_api_key,
        {
          maxConcurrent: 3,
          stopOnError: false
        }
      );
      
      logger.info('AI analysis returned', {
        userId,
        hasResults: !!analysisResults,
        type: typeof analysisResults,
        keys: analysisResults ? Object.keys(analysisResults) : 'null'
      });
    } catch (aiError) {
      logger.error('AI analysis failed', {
        userId,
        error: aiError.message,
        stack: aiError.stack
      });
      throw aiError;
    }

    // Log analysis results
    logger.info('AI analysis complete', {
      userId,
      total: analysisResults.stats.total,
      analyzed: analysisResults.stats.analyzed,
      matches: analysisResults.stats.matches,
      failed: analysisResults.stats.failed
    });

    // Process matches (leads found)
    if (analysisResults.matches.length === 0) {
      logger.info('No leads found in batch', {
        userId,
        messagesAnalyzed: analysisResults.stats.analyzed
      });
      return;
    }

    // Process each matched lead
    for (const match of analysisResults.matches) {
      try {
        // Save to database
        const savedLead = await saveDetectedLead(
          userId,
          match.message,
          match.analysis
        );

        logger.info('Lead detected and saved', {
          userId,
          leadId: savedLead.id,
          confidence: match.analysis.aiResponse.confidence_score
        });

        // Generate message suggestion if message_prompt is configured
        let messageSuggestion = null;
        if (userConfig.message_prompt) {
          try {
            logger.info('Attempting to generate message suggestion', {
              userId,
              leadId: savedLead.id
            });
            
            const suggestionResult = await generateMessageSuggestion(
              match.message,
              match.analysis.aiResponse,
              userConfig.message_prompt,
              userConfig.openrouter_api_key
            );
            
            messageSuggestion = suggestionResult?.suggestion || null;
            
            logger.info('Message suggestion generated successfully', {
              userId,
              leadId: savedLead.id,
              hasSuggestion: !!messageSuggestion
            });
          } catch (suggestionError) {
            logger.error('Failed to generate message suggestion - CONTINUING WITHOUT IT', {
              userId,
              leadId: savedLead.id,
              error: suggestionError.message,
              stack: suggestionError.stack
            });
            // Set to null and continue - suggestion is not critical
            messageSuggestion = null;
          }
        }

        // Post to Telegram immediately (with duplicate check and message suggestion)
        try {
          logger.info('🚀 ATTEMPTING TO POST LEAD TO TELEGRAM', {
            userId,
            leadId: savedLead.id,
            channelId: userConfig.telegram_channel_id,
            hasMessageSuggestion: !!messageSuggestion,
            messagePreview: match.message.message?.substring(0, 100)
          });

          const postResult = await postLeadToChannel(
            match.message,
            match.analysis.aiResponse,
            userConfig.telegram_channel_id,
            null, // botToken
            userId, // userId for duplicate checking
            messageSuggestion // message suggestion
          );

          logger.info('📬 POST RESULT FROM TELEGRAM', {
            userId,
            leadId: savedLead.id,
            success: postResult.success,
            skipped: postResult.skipped,
            messageId: postResult.messageId,
            reason: postResult.reason
          });

          // Only mark as posted if actually posted (not skipped as duplicate)
          if (postResult.success && !postResult.skipped) {
            await markLeadAsPosted(savedLead.id);

            logger.info('✅ Lead posted to Telegram successfully', {
              userId,
              leadId: savedLead.id,
              telegramMessageId: postResult.messageId,
              hasSuggestion: !!messageSuggestion
            });
          } else if (postResult.skipped) {
            logger.info('⏭️ Lead skipped (duplicate)', {
              userId,
              leadId: savedLead.id,
              reason: postResult.reason
            });
          }
        } catch (postError) {
          logger.error('❌ FAILED TO POST LEAD TO TELEGRAM', {
            userId,
            leadId: savedLead.id,
            channelId: userConfig.telegram_channel_id,
            error: postError.message,
            stack: postError.stack
          });
        }
      } catch (saveError) {
        logger.error('Failed to save lead', {
          userId,
          messageId: match.message.id,
          error: saveError.message
        });
      }
    }
  } catch (error) {
    logger.error('Failed to process messages for user', {
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Add message to pending batch
 */
const addToBatch = (message) => {
  // Avoid duplicates
  if (processedMessageIds.has(message.id)) {
    return;
  }

  processedMessageIds.add(message.id);
  pendingMessages.push(message);

  // Clear existing timer
  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  // Set new timer to process batch
  batchTimer = setTimeout(() => {
    processBatch();
  }, BATCH_INTERVAL);

  logger.debug('Message added to batch', {
    messageId: message.id,
    batchSize: pendingMessages.length
  });
};

/**
 * Start real-time message scanner (using polling instead of Realtime)
 */
export const startRealtimeScanner = async () => {
  if (isRunning) {
    logger.warn('Realtime scanner is already running');
    return;
  }

  try {
    const supabase = getSupabase();

    logger.info('🔄 Starting Realtime Message Scanner (polling mode)...');

    // Mark as running immediately
    isRunning = true;
    subscribedAt = new Date().toISOString();
    
    let lastProcessedId = null;

    // Polling function - check for new messages every 5 seconds
    const pollForMessages = async () => {
      if (!isRunning) return;

      try {
        const query = supabase
          .from('messages')
          .select('*')
          .order('id', { ascending: false })
          .limit(10);

        if (lastProcessedId) {
          query.gt('id', lastProcessedId);
        }

        const { data: messages, error } = await query;

        if (error) {
          logger.error('Error polling for messages', { error: error.message });
          return;
        }

        if (messages && messages.length > 0) {
          logger.info('New messages found', { count: messages.length });
          
          // Update last processed ID
          lastProcessedId = Math.max(...messages.map(m => m.id));

          // Process messages in reverse order (oldest first)
          for (const message of messages.reverse()) {
            addToBatch(message);
          }
        }
      } catch (error) {
        logger.error('Polling error', { error: error.message });
      }
    };

    // Start polling every 5 seconds
    realtimeChannel = setInterval(pollForMessages, 5000);
    
    logger.info('✅ Realtime scanner started successfully (polling mode)', {
      subscribedAt,
      interval: '5 seconds'
    });

    // Clean up old processed IDs every hour
    setInterval(() => {
      if (processedMessageIds.size > 10000) {
        const idsArray = Array.from(processedMessageIds);
        processedMessageIds = new Set(idsArray.slice(-5000));
        logger.info('Cleaned up processed message IDs', {
          kept: processedMessageIds.size
        });
      }
    }, 3600000); // 1 hour

    return {
      success: true,
      message: 'Realtime scanner started'
    };
  } catch (error) {
    logger.error('Failed to start realtime scanner', {
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
};

/**
 * Stop real-time message scanner
 */
export const stopRealtimeScanner = async () => {
  if (!isRunning) {
    logger.warn('Realtime scanner is not running');
    return;
  }

  try {
    logger.info('Stopping Realtime Message Scanner...');

    if (realtimeChannel) {
      // Clear interval (polling mode)
      clearInterval(realtimeChannel);
      realtimeChannel = null;
    }

    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }

    isRunning = false;
    subscribedAt = null;

    logger.info('✅ Realtime scanner stopped');

    return {
      success: true,
      message: 'Realtime scanner stopped'
    };
  } catch (error) {
    logger.error('Failed to stop realtime scanner', {
      error: error.message
    });

    throw error;
  }
};

/**
 * Get scanner status
 */
export const getScannerStatus = () => {
  return {
    isRunning,
    subscribedAt,
    pendingBatchSize: pendingMessages.length,
    processedMessagesCount: processedMessageIds.size
  };
};

export default {
  startRealtimeScanner,
  stopRealtimeScanner,
  getScannerStatus
};

