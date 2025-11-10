import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase, healthCheck as dbHealthCheck } from '../config/database.js';
import { healthCheck as openrouterHealthCheck } from '../config/openrouter.js';
import { healthCheck as telegramHealthCheck } from '../config/telegram.js';
import { errorMiddleware } from '../utils/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import logger from '../utils/logger.js';

// Import routes
import configRoutes from './routes/config.js';
import leadsRoutes from './routes/leads.js';
import analyticsRoutes from './routes/analytics.js';
import scannerRoutes from './routes/scanner.js';

/**
 * Express server setup
 */

const app = express();

// ============= MIDDLEWARE =============

// Trust proxy - REQUIRED for Timeweb Cloud deployment
// This allows Express to trust X-Forwarded-For headers from the proxy
app.set('trust proxy', 1);

// CORS configuration - MUST BE BEFORE HELMET!
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  credentials: false
}));

// Security headers - configured to not block CORS
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - DISABLED FOR LOCAL DEVELOPMENT
// app.use('/api/', generalLimiter);

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ============= ROUTES =============

// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    server: 'healthy',
    database: await dbHealthCheck(),
    openrouter: process.env.OPENROUTER_API_KEY ? 
      { status: 'configured', message: 'API key present' } : 
      { status: 'not_configured', message: 'No API key configured' },
    telegram: process.env.TELEGRAM_BOT_TOKEN ?
      { status: 'configured', message: 'Bot token present' } :
      { status: 'not_configured', message: 'No bot token configured' }
  };
  
  const allHealthy = Object.values(checks).every(check => 
    typeof check === 'string' ? check === 'healthy' : 
    check.status === 'healthy' || check.status === 'configured'
  );
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Telegram Lead Scanner API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      config: '/api/config',
      leads: '/api/leads',
      analytics: '/api/analytics',
      scanner: '/api/scanner'
    }
  });
});

// API routes
app.use('/api/config', configRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/scanner', scannerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: [
      '/health',
      '/api/config',
      '/api/leads',
      '/api/analytics',
      '/api/scanner'
    ]
  });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

// ============= SERVER INITIALIZATION =============

/**
 * Initialize server
 */
export const initializeServer = async () => {
  try {
    // Initialize database
    logger.info('Initializing database connection...');
    await initializeDatabase();
    
    // Test database connection
    await dbHealthCheck();
    
    logger.info('Server initialization complete');
  } catch (error) {
    logger.error('Server initialization failed', { error: error.message });
    throw error;
  }
};

/**
 * Start server
 */
export const startServer = async (port = null) => {
  const PORT = port || process.env.PORT || 3000;
  
  try {
    // Initialize
    await initializeServer();
    
    // Start listening
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API: http://localhost:${PORT}/api`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

export default app;

