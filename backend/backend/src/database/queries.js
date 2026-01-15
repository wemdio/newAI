import { getSupabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { DatabaseError } from '../utils/errorHandler.js';

/**
 * Database query functions
 * Centralized database operations
 */

// ============= USER CONFIG QUERIES =============

/**
 * Get user configuration
 * @param {string} userId - User ID
 * @returns {object} User configuration
 */
export const getUserConfig = async (userId) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('user_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to get user config', { userId, error: error.message });
    throw new DatabaseError('Failed to get user config', { originalError: error.message });
  }
};

/**
 * Create or update user configuration
 * @param {string} userId - User ID
 * @param {object} config - Configuration data
 * @returns {object} Saved configuration
 */
export const saveUserConfig = async (userId, config) => {
  try {
    const supabase = getSupabase();
    
    const configData = {
      user_id: userId,
      ...config,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('user_config')
      .upsert(configData, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info('Saved user config', { userId });
    return data;
  } catch (error) {
    logger.error('Failed to save user config', { userId, error: error.message });
    throw new DatabaseError('Failed to save user config', { originalError: error.message });
  }
};

/**
 * Get all active user configurations
 * @returns {array} Active user configs
 */
export const getActiveUserConfigs = async () => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('user_config')
      .select('*')
      .eq('is_active', true);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error('Failed to get active user configs', { error: error.message });
    throw new DatabaseError('Failed to get active user configs', { originalError: error.message });
  }
};

// ============= DETECTED LEADS QUERIES =============

/**
 * Get detected leads for user
 * @param {string} userId - User ID
 * @param {object} filters - Query filters
 * @returns {array} Detected leads
 */
export const getDetectedLeads = async (userId, filters = {}) => {
  try {
    const supabase = getSupabase();
    
    const {
      limit = 100,
      offset = 0,
      startDate = null,
      endDate = null,
      minConfidence = null,
      posted = null,
      contacted = null,
      leadStatus = null
    } = filters;
    
    let query = supabase
      .from('detected_leads')
      .select(`
        *,
        messages (*)
      `)
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (startDate) {
      query = query.gte('detected_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('detected_at', endDate);
    }
    
    if (minConfidence !== null) {
      query = query.gte('confidence_score', minConfidence);
    }
    
    if (posted !== null) {
      query = query.eq('posted_to_telegram', posted);
    }
    
    if (contacted !== null) {
      query = query.eq('is_contacted', contacted);
    }
    
    if (leadStatus !== null) {
      query = query.eq('lead_status', leadStatus);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error('Failed to get detected leads', { userId, error: error.message });
    throw new DatabaseError('Failed to get detected leads', { originalError: error.message });
  }
};

/**
 * Get single detected lead
 * @param {number} leadId - Lead ID
 * @param {string} userId - User ID (for authorization)
 * @returns {object} Lead data
 */
export const getDetectedLead = async (leadId, userId) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('detected_leads')
      .select(`
        *,
        messages (*)
      `)
      .eq('id', leadId)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    logger.error('Failed to get detected lead', { leadId, userId, error: error.message });
    throw new DatabaseError('Failed to get detected lead', { originalError: error.message });
  }
};

/**
 * Update detected lead
 * @param {number} leadId - Lead ID
 * @param {string} userId - User ID (for authorization)
 * @param {object} updates - Fields to update
 * @returns {object} Updated lead
 */
export const updateDetectedLead = async (leadId, userId, updates) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('detected_leads')
      .update(updates)
      .eq('id', leadId)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info('Updated detected lead', { leadId, userId });
    return data;
  } catch (error) {
    logger.error('Failed to update detected lead', { leadId, userId, error: error.message });
    throw new DatabaseError('Failed to update detected lead', { originalError: error.message });
  }
};

/**
 * Delete detected lead
 * @param {number} leadId - Lead ID
 * @param {string} userId - User ID (for authorization)
 */
export const deleteDetectedLead = async (leadId, userId) => {
  try {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('detected_leads')
      .delete()
      .eq('id', leadId)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    logger.info('Deleted detected lead', { leadId, userId });
  } catch (error) {
    logger.error('Failed to delete detected lead', { leadId, userId, error: error.message });
    throw new DatabaseError('Failed to delete detected lead', { originalError: error.message });
  }
};

/**
 * Get lead statistics for user
 * @param {string} userId - User ID
 * @param {number} days - Number of days to look back
 * @returns {object} Lead statistics
 */
export const getLeadStatistics = async (userId, days = 30) => {
  try {
    const supabase = getSupabase();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('detected_leads')
      .select('confidence_score, detected_at, is_contacted, posted_to_telegram')
      .eq('user_id', userId)
      .gte('detected_at', startDate.toISOString());
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return {
        totalLeads: 0,
        averageConfidence: 0,
        contacted: 0,
        notContacted: 0,
        posted: 0,
        notPosted: 0,
        byDay: {}
      };
    }
    
    const stats = {
      totalLeads: data.length,
      averageConfidence: Math.round(
        data.reduce((sum, lead) => sum + lead.confidence_score, 0) / data.length
      ),
      contacted: data.filter(lead => lead.is_contacted).length,
      notContacted: data.filter(lead => !lead.is_contacted).length,
      posted: data.filter(lead => lead.posted_to_telegram).length,
      notPosted: data.filter(lead => !lead.posted_to_telegram).length,
      byDay: {}
    };
    
    // Group by day
    data.forEach(lead => {
      const day = new Date(lead.detected_at).toISOString().split('T')[0];
      if (!stats.byDay[day]) {
        stats.byDay[day] = 0;
      }
      stats.byDay[day]++;
    });
    
    return stats;
  } catch (error) {
    logger.error('Failed to get lead statistics', { userId, error: error.message });
    throw new DatabaseError('Failed to get lead statistics', { originalError: error.message });
  }
};

// ============= MESSAGES QUERIES =============

/**
 * Search messages
 * @param {object} filters - Search filters
 * @returns {array} Matching messages
 */
export const searchMessages = async (filters = {}) => {
  try {
    const supabase = getSupabase();
    
    const {
      query = '',
      chatName = null,
      username = null,
      startDate = null,
      endDate = null,
      limit = 100
    } = filters;
    
    let dbQuery = supabase
      .from('messages')
      .select('*')
      .order('message_time', { ascending: false })
      .limit(limit);
    
    if (query) {
      dbQuery = dbQuery.ilike('message', `%${query}%`);
    }
    
    if (chatName) {
      dbQuery = dbQuery.eq('chat_name', chatName);
    }
    
    if (username) {
      dbQuery = dbQuery.eq('username', username);
    }
    
    if (startDate) {
      dbQuery = dbQuery.gte('message_time', startDate);
    }
    
    if (endDate) {
      dbQuery = dbQuery.lte('message_time', endDate);
    }
    
    const { data, error } = await dbQuery;
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error('Failed to search messages', { error: error.message });
    throw new DatabaseError('Failed to search messages', { originalError: error.message });
  }
};

// ============= AI MESSAGING CAMPAIGN QUERIES =============

/**
 * Get active AI campaign with confidence filter settings for user
 * Returns the first active campaign with filter_by_confidence enabled
 * @param {string} userId - User ID
 * @returns {object|null} Campaign settings or null if no active campaign with filter
 */
export const getActiveConfidenceFilter = async (userId) => {
  try {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .select('id, filter_by_confidence, max_confidence_for_ai')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('filter_by_confidence', true)
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    
    return data; // null if no matching campaign
  } catch (error) {
    logger.error('Failed to get active confidence filter', { userId, error: error.message });
    // Return null on error - don't block posting
    return null;
  }
};

export default {
  getUserConfig,
  saveUserConfig,
  getActiveUserConfigs,
  getDetectedLeads,
  getDetectedLead,
  updateDetectedLead,
  deleteDetectedLead,
  getLeadStatistics,
  searchMessages,
  getActiveConfidenceFilter
};

