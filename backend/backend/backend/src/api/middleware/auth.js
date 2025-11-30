import logger from '../../utils/logger.js';

/**
 * Simple authentication middleware
 * In production, this should use proper JWT or session-based auth
 */

/**
 * Extract user ID from request
 * For now, expects user_id in header or query
 * In production, extract from verified JWT token
 */
export const authenticateUser = (req, res, next) => {
  try {
    // Try to get user ID from different sources
    const userId = 
      req.headers['x-user-id'] || 
      req.query.user_id || 
      req.body.user_id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID is required. Provide x-user-id header or user_id parameter.'
      });
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID',
        message: 'User ID must be a valid UUID'
      });
    }
    
    // Attach user ID to request
    req.userId = userId;
    
    logger.debug('User authenticated', { userId });
    
    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
};

/**
 * Optional authentication
 * Continues even if no user ID provided
 */
export const optionalAuth = (req, res, next) => {
  const userId = 
    req.headers['x-user-id'] || 
    req.query.user_id || 
    req.body.user_id;
  
  if (userId) {
    req.userId = userId;
  }
  
  next();
};

/**
 * TODO: Implement proper JWT authentication
 * 
 * export const verifyJWT = (req, res, next) => {
 *   const token = req.headers.authorization?.split(' ')[1];
 *   
 *   if (!token) {
 *     return res.status(401).json({ error: 'No token provided' });
 *   }
 *   
 *   try {
 *     const decoded = jwt.verify(token, process.env.JWT_SECRET);
 *     req.userId = decoded.userId;
 *     next();
 *   } catch (error) {
 *     res.status(401).json({ error: 'Invalid token' });
 *   }
 * };
 */

export default {
  authenticateUser,
  optionalAuth
};

