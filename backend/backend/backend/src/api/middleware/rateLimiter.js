import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';

/**
 * Rate limiting middleware
 */

/**
 * General API rate limiter
 * 1000 requests per 15 minutes (very high limit for development)
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Very high limit for smooth development
  message: {
    error: 'Too many requests',
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy headers (required for Timeweb Cloud)
  trust: true,
  // Use userId if available, otherwise fallback to IP
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      userId: req.headers['x-user-id'],
      ip: req.ip,
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict rate limiter for expensive operations
 * 10 requests per hour
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many requests',
    message: 'This endpoint has strict rate limits. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Trust proxy headers (required for Timeweb Cloud)
  trust: true,
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Strict rate limit exceeded. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Auth endpoints rate limiter
 * 5 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy headers (required for Timeweb Cloud)
  trust: true
});

export default {
  generalLimiter,
  strictLimiter,
  authLimiter
};

