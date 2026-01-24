import { getSupabase } from '../config/database.js';
import { getActiveUserConfigs, getActiveConfidenceFilter } from '../database/queries.js';
import { preFilterMessages } from '../validators/messagePreFilter.js';
import { analyzeBatch, doubleCheckLead } from './messageAnalyzer.js';
import { saveDetectedLead } from './leadDetector.js';
import { postLeadToChannel, markLeadAsPosted } from './telegramPoster.js';
import { generateMessageSuggestion } from './messageSuggestion.js';
import logger from '../utils/logger.js';

/**
 * Real-time message scanner using Supabase Realtime
 * Analyzes messages immediately as they are inserted
 */

// ============= DOUBLE CHECK CONFIG =============
const DOUBLECHECK_MODE = (process.env.DOUBLECHECK_MODE || 'always').toLowerCase(); // always | smart | off
const DOUBLECHECK_MIN_CONFIDENCE = Number.parseInt(process.env.DOUBLECHECK_MIN_CONFIDENCE || '90', 10);

const DOUBLECHECK_RISK_PATTERNS = [
  /\bваканси[яи]\b/i,
  /\bрезюме\b/i,
  /\bищу\s+работ/i,
  /\bподработ/i,
  /\bоклад\b/i,
  /\bзарплат/i,
  /\bзп\b/i,
  /\bтребу(ется|ются)\b/i,
  /\bнанима(ем|ю|ют)\b/i,
  /\bпредлага(ю|ем|ют)\b/i,
  /\bоказыва(ю|ем|ют)\s+услуг/i,
  /\bуслуг[аи]\b/i,
  /\bнастрою\b/i,
  /\bсделаю\b/i,
  /\bпомогу\b/i,
  /\bпродам\b/i,
  /\bреклам/i,
  /\bподписывай(тесь)?\b/i
];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SUPABASE_FETCH_RETRY_ATTEMPTS = toPositiveInt(process.env.SUPABASE_FETCH_RETRY_ATTEMPTS || '3', 3);
const SUPABASE_FETCH_RETRY_BASE_DELAY_MS = toPositiveInt(process.env.SUPABASE_FETCH_RETRY_BASE_DELAY_MS || '500', 500);
const SUPABASE_FETCH_RETRY_MAX_DELAY_MS = toPositiveInt(process.env.SUPABASE_FETCH_RETRY_MAX_DELAY_MS || '5000', 5000);

const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildSupabaseErrorMeta = (error) => {
  if (!error) return {};
  const meta = {
    error: error?.message || String(error),
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status || error?.statusCode,
    cause: error?.cause?.message,
    causeCode: error?.cause?.code,
    stack: error?.stack
  };

  return Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};

const isRetryableSupabaseError = (error) => {
  if (!error) return false;
  const message = String(error?.message || error).toLowerCase();
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);

  if (RETRYABLE_ERROR_CODES.has(code)) return true;
  if (message.includes('fetch failed')) return true;
  if (message.includes('network') || message.includes('timeout') || message.includes('timed out')) return true;
  if (status >= 500) return true;

  return false;
};

const runSupabaseQueryWithRetry = async (queryFn, context) => {
  const attempts = SUPABASE_FETCH_RETRY_ATTEMPTS;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data, error } = await queryFn();
      if (!error) {
        return { data, error: null, attempt };
      }

      lastError = error;
      const retryable = isRetryableSupabaseError(error);
      logger.warn('Supabase query failed', {
        ...context,
        attempt,
        attempts,
        retryable,
        ...buildSupabaseErrorMeta(error)
      });

      if (!retryable || attempt === attempts) {
        break;
      }
    } catch (error) {
      lastError = error;
      const retryable = isRetryableSupabaseError(error);
      logger.warn('Supabase query exception', {
        ...context,
        attempt,
        attempts,
        retryable,
        ...buildSupabaseErrorMeta(error)
      });

      if (!retryable || attempt === attempts) {
        break;
      }
    }

    const delay = Math.min(
      SUPABASE_FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      SUPABASE_FETCH_RETRY_MAX_DELAY_MS
    );
    await sleep(delay);
  }

  return { data: null, error: lastError, attempt: attempts };
};

const getRiskCheckText = (message) => {
  return [message?.message, message?.bio, message?.chat_name].filter(Boolean).join(' ');
};

const matchedCriteriaCount = (matchedCriteria) => {
  if (!matchedCriteria) return 0;
  if (Array.isArray(matchedCriteria)) return matchedCriteria.length;
  if (typeof matchedCriteria === 'string') return matchedCriteria.trim().length > 0 ? 1 : 0;
  return 0;
};

const looksRiskyNonLead = (message) => {
  const text = getRiskCheckText(message);
  if (!text) return false;
  return DOUBLECHECK_RISK_PATTERNS.some((re) => re.test(text));
};

const shouldRunGeminiDoubleCheck = (message, aiResponse) => {
  if (DOUBLECHECK_MODE === 'always') return true;
  if (DOUBLECHECK_MODE === 'off') return false;
  // Smart mode
  const confidence = Number(aiResponse?.confidence_score ?? 0);
  const msgLen = (message?.message || '').length;
  const criteriaCnt = matchedCriteriaCount(aiResponse?.matched_criteria);

  if (!Number.isFinite(confidence)) return true;
  if (confidence < DOUBLECHECK_MIN_CONFIDENCE) return true;
  if (criteriaCnt === 0) return true;
  if (msgLen < 20) return true;
  if (looksRiskyNonLead(message)) return true;

  return false;
};

let realtimeChannel = null;
let isRunning = false;
let subscribedAt = null;
let processedMessageIds = new Set();
const BATCH_INTERVAL = 5000; // 5 seconds
let pendingMessages = [];
let batchTimer = null;

// Track last processed message ID per user to ensure all users get all messages
let userLastProcessedIds = new Map();

/**
 * Process messages for all active users
 * Each user tracks their own lastProcessedId to ensure they get ALL new messages
 */
const processBatch = async () => {
  try {
    const supabase = getSupabase();
    
    // Get active user configs
    const activeUsers = await getActiveUserConfigs();

    if (activeUsers.length === 0) {
      logger.debug('No active users to process messages for');
      return;
    }

    // Log active users for debugging
    logger.debug('Active users found', {
      count: activeUsers.length,
      userIds: activeUsers.map(u => u.user_id.substring(0, 8) + '...')
    });

    // Process for each active user independently
    for (const userConfig of activeUsers) {
      try {
        const userId = userConfig.user_id;
        
        // Get or initialize last processed ID for this user
        let userLastId = userLastProcessedIds.get(userId);
        
        // If user is new or was reactivated, start from current max ID
        // This prevents processing old messages when user first activates
        if (userLastId === undefined) {
          const { data: latestMessage } = await supabase
            .from('messages')
            .select('id')
            .order('id', { ascending: false })
            .limit(1)
            .single();
          
          userLastId = latestMessage?.id || 0;
          userLastProcessedIds.set(userId, userLastId);
          
          logger.info('Initialized lastProcessedId for user', {
            userId,
            startingFromId: userLastId
          });
          continue; // Skip this cycle, start processing from next poll
        }
        
        // Fetch new messages for this user (messages after their lastProcessedId)
        // Limit can be configured via env var, default 1000 messages per user per cycle
        const messagesLimit = parseInt(process.env.MESSAGES_PER_CYCLE || '1000', 10);
        const { data: messages, error } = await runSupabaseQueryWithRetry(
          () => supabase
          .from('messages')
          .select('*')
          .gt('id', userLastId)
          .order('id', { ascending: true })
            .limit(messagesLimit),
          {
            userId,
            action: 'fetch_messages',
            lastProcessedId: userLastId,
            limit: messagesLimit
          }
        );
        
        if (error) {
          logger.error('Error fetching messages for user', {
            userId,
            ...buildSupabaseErrorMeta(error)
          });
          continue;
        }
        
        if (!messages || messages.length === 0) {
          logger.debug('No new messages for user', { userId, lastProcessedId: userLastId });
          continue; // No new messages for this user
        }
        
        logger.info('Processing messages for user', {
          userId,
          count: messages.length,
          fromId: userLastId,
          toId: messages[messages.length - 1].id
        });
        
        // Update user's last processed ID
        userLastProcessedIds.set(userId, messages[messages.length - 1].id);
        
        // Process messages for this user
        await processMessagesForUser(messages, userConfig);
        
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
          maxConcurrent: parseInt(process.env.AI_CONCURRENCY || '20', 10),
          stopOnError: false,
          useBatchApi: process.env.USE_BATCH_API !== 'false', // Enable by default
          batchSize: parseInt(process.env.BATCH_SIZE || '5', 10) // 5 messages per API call
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
        // ============= DOUBLE CHECK WITH GEMINI =============
        const shouldDoubleCheck = shouldRunGeminiDoubleCheck(match.message, match.analysis.aiResponse);
        
        if (shouldDoubleCheck) {
          try {
            const verification = await doubleCheckLead(
              match.message,
              match.analysis.aiResponse,
              userConfig.lead_prompt,
              userConfig.openrouter_api_key
            );

            if (!verification.verified) {
              logger.info('Lead rejected by Gemini Double Check', {
                userId,
                messageId: match.message.id,
                reason: verification.reasoning
              });
              continue; // Skip saving this lead
            }

            // PRESERVE original reasoning, just add verification prefix
            const originalReasoning = match.analysis.aiResponse.reasoning || '';
            match.analysis.aiResponse.reasoning = `[Gemini ✓] ${originalReasoning}`;
          } catch (dcError) {
            logger.warn('Double check failed, proceeding with original analysis', {
              userId,
              messageId: match.message.id,
              error: dcError.message
            });
            // Continue with original analysis if double check fails
          }
        } else {
          logger.debug('Skipping Gemini Double Check (smart mode)', {
            userId,
            messageId: match.message.id,
            confidence: match.analysis.aiResponse?.confidence_score,
            mode: DOUBLECHECK_MODE
          });
        }

        // Save to database
        const savedLead = await saveDetectedLead(
          userId,
          match.message,
          match.analysis
        );

        // Skip if duplicate (savedLead will be null)
        if (!savedLead) {
          logger.info('Skipped duplicate lead in realtime scanner', {
            userId,
            messageId: match.message.id
          });
          continue;
        }

        logger.info('Lead detected and saved', {
          userId,
          leadId: savedLead.id,
          confidence: match.analysis.aiResponse.confidence_score,
          doubleChecked: shouldDoubleCheck
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
          const confidenceScore = match.analysis.aiResponse?.confidence_score || 0;
          const telegramMinConfidence = Number.parseInt(userConfig.telegram_min_confidence ?? 0, 10);
          const telegramMinConfidenceValue = Number.isFinite(telegramMinConfidence) ? telegramMinConfidence : 0;
          
          // Check if user has active AI campaign with confidence filter
          // If enabled, skip Telegram posting for leads below threshold (AI will handle them)
          const confidenceFilter = await getActiveConfidenceFilter(userId);
          
          if (confidenceFilter && confidenceScore < confidenceFilter.max_confidence_for_ai) {
            logger.info('⏭️ Skipping Telegram post - lead below AI threshold (AI will contact)', {
              userId,
              leadId: savedLead.id,
              confidenceScore,
              threshold: confidenceFilter.max_confidence_for_ai,
              campaignId: confidenceFilter.id
            });
            // Lead is saved but not posted - AI campaign will handle outreach
            continue;
          }

          if (telegramMinConfidenceValue > 0 && confidenceScore < telegramMinConfidenceValue) {
            logger.info('⏭️ Skipping Telegram post - below user Telegram confidence threshold', {
              userId,
              leadId: savedLead.id,
              confidenceScore,
              threshold: telegramMinConfidenceValue
            });
            // Lead is saved but not posted due to Telegram threshold
            continue;
          }
          
          logger.info('🚀 ATTEMPTING TO POST LEAD TO TELEGRAM', {
            userId,
            leadId: savedLead.id,
            channelId: userConfig.telegram_channel_id,
            hasMessageSuggestion: !!messageSuggestion,
            confidenceScore,
            passedConfidenceFilter: !confidenceFilter || confidenceScore >= (confidenceFilter?.max_confidence_for_ai || 0),
            telegramMinConfidence: telegramMinConfidenceValue,
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
 * Add message to pending batch (legacy - kept for compatibility)
 */
const addToBatch = (message) => {
  // Avoid duplicates
  if (processedMessageIds.has(message.id)) {
    return;
  }

  processedMessageIds.add(message.id);
  pendingMessages.push(message);

  logger.debug('Message added to batch', {
    messageId: message.id,
    batchSize: pendingMessages.length
  });
};

/**
 * Start real-time message scanner (using polling instead of Realtime)
 * Each user independently tracks their own lastProcessedId
 */
export const startRealtimeScanner = async () => {
  if (isRunning) {
    logger.warn('Realtime scanner is already running');
    return;
  }

  try {
    logger.info('🔄 Starting Realtime Message Scanner (per-user tracking mode)...');

    // Mark as running immediately
    isRunning = true;
    subscribedAt = new Date().toISOString();
    
    // Clear user tracking on restart
    userLastProcessedIds.clear();
    
    logger.info('Scanner initialized - each user will track their own message position');

    // Start processing every 5 seconds
    // processBatch now handles per-user message fetching
    realtimeChannel = setInterval(processBatch, BATCH_INTERVAL);
    
    logger.info('✅ Realtime scanner started successfully (per-user tracking mode)', {
      subscribedAt,
      interval: `${BATCH_INTERVAL / 1000} seconds`
    });

    // Clean up inactive users from tracking every hour
    setInterval(() => {
      // Keep tracking map clean - will be repopulated when users become active
      if (userLastProcessedIds.size > 100) {
        logger.info('Cleaning up user tracking map', {
          before: userLastProcessedIds.size
        });
        // Keep only last 50 users (most recently active will be re-added)
        const entries = Array.from(userLastProcessedIds.entries());
        userLastProcessedIds = new Map(entries.slice(-50));
        logger.info('User tracking map cleaned', {
          after: userLastProcessedIds.size
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
    
    // Clear user tracking
    userLastProcessedIds.clear();

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
    processedMessagesCount: processedMessageIds.size,
    trackedUsersCount: userLastProcessedIds.size,
    userPositions: Object.fromEntries(userLastProcessedIds)
  };
};

export default {
  startRealtimeScanner,
  stopRealtimeScanner,
  getScannerStatus
};

