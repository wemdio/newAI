import cron from 'node-cron';
import { runHourlyScan, retryUnpostedLeads } from './hourlyScanner.js';
import logger from '../utils/logger.js';

/**
 * Cron job scheduler
 * Manages all scheduled tasks
 */

let hourlyScanJob = null;
let retryJob = null;

/**
 * Start the hourly scan job
 * Runs at the start of every hour (e.g., 1:00, 2:00, 3:00)
 */
export const startHourlyScan = () => {
  if (hourlyScanJob) {
    logger.warn('Hourly scan job already running');
    return;
  }
  
  // Cron expression: minute hour day month weekday
  // '0 * * * *' = every hour at minute 0
  const cronExpression = '0 * * * *';
  
  hourlyScanJob = cron.schedule(cronExpression, async () => {
    try {
      logger.info('Triggering hourly scan job');
      await runHourlyScan();
    } catch (error) {
      logger.error('Hourly scan job failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }, {
    scheduled: true,
    timezone: 'UTC' // Use UTC for consistency
  });
  
  logger.info('Hourly scan job scheduled', {
    cronExpression,
    timezone: 'UTC',
    nextRun: getNextRunTime(cronExpression)
  });
};

/**
 * Stop the hourly scan job
 */
export const stopHourlyScan = () => {
  if (hourlyScanJob) {
    hourlyScanJob.stop();
    hourlyScanJob = null;
    logger.info('Hourly scan job stopped');
  }
};

/**
 * Start the retry unposted leads job
 * Runs every 30 minutes to catch any failed posts
 */
export const startRetryJob = () => {
  if (retryJob) {
    logger.warn('Retry job already running');
    return;
  }
  
  // Run every 30 minutes
  const cronExpression = '*/30 * * * *';
  
  retryJob = cron.schedule(cronExpression, async () => {
    try {
      logger.info('Triggering retry unposted leads job');
      await retryUnpostedLeads();
    } catch (error) {
      logger.error('Retry job failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  logger.info('Retry job scheduled', {
    cronExpression,
    timezone: 'UTC',
    nextRun: getNextRunTime(cronExpression)
  });
};

/**
 * Stop the retry job
 */
export const stopRetryJob = () => {
  if (retryJob) {
    retryJob.stop();
    retryJob = null;
    logger.info('Retry job stopped');
  }
};

/**
 * Start all scheduled jobs
 */
export const startAllJobs = () => {
  logger.info('Starting all scheduled jobs');
  
  startHourlyScan();
  startRetryJob();
  
  logger.info('All scheduled jobs started');
};

/**
 * Stop all scheduled jobs
 */
export const stopAllJobs = () => {
  logger.info('Stopping all scheduled jobs');
  
  stopHourlyScan();
  stopRetryJob();
  
  logger.info('All scheduled jobs stopped');
};

/**
 * Get next run time for a cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {string} Next run time
 */
const getNextRunTime = (cronExpression) => {
  try {
    const job = cron.schedule(cronExpression, () => {}, { scheduled: false });
    // Note: node-cron doesn't expose next run time directly
    // This is a placeholder - you might want to use a library like cron-parser
    return 'Next run calculated by cron';
  } catch (error) {
    return 'Unable to calculate';
  }
};

/**
 * Get job status
 * @returns {object} Status of all jobs
 */
export const getJobStatus = () => {
  return {
    hourlyScan: {
      running: hourlyScanJob !== null,
      cronExpression: '0 * * * *',
      description: 'Runs every hour to scan for leads'
    },
    retryJob: {
      running: retryJob !== null,
      cronExpression: '*/30 * * * *',
      description: 'Runs every 30 minutes to retry failed posts'
    }
  };
};

/**
 * Trigger hourly scan manually (for testing)
 */
export const triggerHourlyScanManually = async () => {
  logger.info('Manually triggering hourly scan');
  
  try {
    const results = await runHourlyScan();
    return {
      success: true,
      results
    };
  } catch (error) {
    logger.error('Manual hourly scan failed', {
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Trigger retry job manually (for testing)
 */
export const triggerRetryManually = async () => {
  logger.info('Manually triggering retry job');
  
  try {
    const results = await retryUnpostedLeads();
    return {
      success: true,
      results
    };
  } catch (error) {
    logger.error('Manual retry failed', {
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  startHourlyScan,
  stopHourlyScan,
  startRetryJob,
  stopRetryJob,
  startAllJobs,
  stopAllJobs,
  getJobStatus,
  triggerHourlyScanManually,
  triggerRetryManually
};

