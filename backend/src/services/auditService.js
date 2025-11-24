import { detectLeads } from './leadDetector.js';
import { postLeadToChannel } from './telegramPoster.js';
import logger from '../utils/logger.js';

/**
 * Run a retroactive audit for leads
 * @param {string} userId - Admin User ID
 * @param {object} config - Audit configuration
 * @returns {object} Audit stats
 */
export const runAudit = async (userId, config) => {
  const {
    openRouterKey,
    leadPrompt,
    channelId,
    daysBack = 7
  } = config;

  logger.info('Starting Audit', { userId, daysBack, channelId });

  // 1. Configure detection
  const auditUserConfig = {
    openrouter_api_key: openRouterKey,
    lead_prompt: leadPrompt
  };

  const detectionOptions = {
    hoursBack: daysBack * 24,
    maxMessages: 2000 // Allow scanning more messages for audit
  };

  // 2. Run Detection Pipeline
  // This will fetch messages, analyze them with the NEW prompt, 
  // and save any NEWLY detected leads to the DB.
  const results = await detectLeads(userId, auditUserConfig, detectionOptions);

  // 3. Post Results to Channel
  const posted = [];
  const failed = [];
  
  // Get Bot Token from env
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  for (const leadData of results.leads) {
    try {
       // leadData structure from detectLeads:
       // { detectedLeadId, message (original), analysis (aiResponse) }
       
       // Add a flag to indicate this is an AUDIT result
       const suggestion = `🔍 AUDIT RESULT\nMatched Criteria: ${leadData.analysis.matched_criteria.join(', ')}`;

       const postResult = await postLeadToChannel(
         leadData.message,
         leadData.analysis,
         channelId,
         botToken,
         null, // No duplicate checking for posting (we want to see all found)
         suggestion
       );

       if (postResult.success) {
         posted.push(leadData.detectedLeadId);
       } else {
         failed.push(leadData.detectedLeadId);
       }
    } catch (err) {
       logger.error('Audit post failed', { err, leadId: leadData.detectedLeadId });
       failed.push(leadData.detectedLeadId);
    }
  }

  return {
    found: results.leadsDetected,
    posted: posted.length,
    failed: failed.length,
    totalAnalyzed: results.messagesAnalyzed,
    totalFetched: results.messagesFetched,
    duration: results.duration
  };
};

