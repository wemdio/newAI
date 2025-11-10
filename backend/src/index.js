import 'dotenv/config';
import { startServer } from './api/server.js';
import { startRealtimeScanner } from './services/realtimeScanner.js';
import { getActiveUserConfigs } from './database/queries.js';
import logger from './utils/logger.js';

/**
 * Application entry point
 * Starts API server and auto-starts scanner if user config is active
 */

const main = async () => {
  try {
    logger.info('========================================');
    logger.info('Telegram Lead Scanner & Analyzer');
    logger.info('========================================');
    
    // Start API server
    logger.info('Starting API server...');
    await startServer();
    
    // Auto-start scanner (runs 24/7)
    logger.info('🚀 Starting scanner automatically...');
    try {
      await startRealtimeScanner();
      logger.info('✅ Scanner started successfully (24/7 mode)');
      logger.info('💡 Users control their own analysis via "Active/Paused" toggle');
    } catch (scannerError) {
      logger.error('Failed to start scanner', {
        error: scannerError.message
      });
      // Continue - scanner can be started via API if needed
    }
    
    logger.info('========================================');
    logger.info('✅ Application started successfully');
    logger.info('========================================');
  } catch (error) {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Run application
main();

