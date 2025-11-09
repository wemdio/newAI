import 'dotenv/config';
import { startServer } from './api/server.js';
import logger from './utils/logger.js';

/**
 * Application entry point
 * Starts API server
 */

const main = async () => {
  try {
    logger.info('========================================');
    logger.info('Telegram Lead Scanner & Analyzer');
    logger.info('========================================');
    
    // Start API server
    logger.info('Starting API server...');
    await startServer();
    
    logger.info('========================================');
    logger.info('✅ Application started successfully');
    logger.info('💡 Scanner is STOPPED by default');
    logger.info('🎛️  Use the UI to Start/Stop the scanner');
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

