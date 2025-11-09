import logger from './logger.js';

/**
 * Custom error classes
 */
export class DatabaseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.details = details;
  }
}

export class AIServiceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AIServiceError';
    this.details = details;
  }
}

export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class TelegramError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TelegramError';
    this.details = details;
  }
}

export class ConfigurationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ConfigurationError';
    this.details = details;
  }
}

/**
 * Global error handler
 */
export const handleError = (error, context = '') => {
  const errorInfo = {
    name: error.name,
    message: error.message,
    context,
    ...(error.details && { details: error.details }),
    ...(error.stack && { stack: error.stack })
  };

  logger.error(`Error in ${context}`, errorInfo);
  
  return errorInfo;
};

/**
 * Async error wrapper
 */
export const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Express error middleware
 */
export const errorMiddleware = (err, req, res, next) => {
  const errorInfo = handleError(err, `${req.method} ${req.path}`);
  
  // Determine status code
  let statusCode = 500;
  if (err.name === 'ValidationError') statusCode = 400;
  if (err.name === 'ConfigurationError') statusCode = 400;
  if (err.name === 'UnauthorizedError') statusCode = 401;
  if (err.name === 'ForbiddenError') statusCode = 403;
  if (err.name === 'NotFoundError') statusCode = 404;
  
  // Send error response
  res.status(statusCode).json({
    error: {
      message: err.message,
      type: err.name,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

/**
 * Retry with exponential backoff
 */
export const retryWithBackoff = async (
  fn,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000
) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(2, i), maxDelay);
        logger.warn(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`, {
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

export default {
  DatabaseError,
  AIServiceError,
  ValidationError,
  TelegramError,
  ConfigurationError,
  handleError,
  asyncHandler,
  errorMiddleware,
  retryWithBackoff
};

