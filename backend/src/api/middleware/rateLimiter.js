import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';

/**
 * Rate limiting middleware
 */

/**
 * General API rate limiter for multi-tenant SaaS
 * 500 requests per 15 minutes per user
 * Key based on user ID (not IP) for proper multi-tenant support
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased for multiple concurrent users
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this user, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID instead of IP for multi-tenant
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
 * Strict rate limiter for expensive operations (AI analysis, bulk operations)
 * 50 requests per hour per user
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Increased for production use
  message: {
    error: 'Too many requests',
    message: 'This endpoint has strict rate limits. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded', {
      userId: req.headers['x-user-id'],
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
  legacyHeaders: false
});

/**
 * Light rate limiter for read-only operations (status checks, config reads)
 * 1000 requests per 15 minutes per user
 * More permissive for frequent polling operations
 */
export const lightLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for status checks and reads
  message: {
    error: 'Too many requests',
    message: 'Too many status checks. Please reduce polling frequency.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Light rate limit exceeded', {
      userId: req.headers['x-user-id'],
      ip: req.ip,
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please reduce polling frequency.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

export default {
  generalLimiter,
  strictLimiter,
  authLimiter,
  lightLimiter
};

