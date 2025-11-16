import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { DatabaseError } from '../utils/errorHandler.js';

/**
 * Supabase client configuration
 * Note: Credentials are available via MCP, but can also be set via env vars
 */

let supabaseClient = null;

/**
 * Initialize Supabase client
 */
export const initializeDatabase = () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    // Use SERVICE_ROLE_KEY for backend (admin access)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new DatabaseError('Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      },
      global: {
        headers: {
          'x-application-name': 'telegram-lead-scanner'
        }
      }
    });

    logger.info('Supabase client initialized successfully');
    return supabaseClient;
  } catch (error) {
    logger.error('Failed to initialize Supabase client', { error: error.message });
    throw error;
  }
};

/**
 * Get Supabase client instance
 */
export const getSupabase = () => {
  if (!supabaseClient) {
    return initializeDatabase();
  }
  return supabaseClient;
};

/**
 * Test database connection
 */
export const testConnection = async () => {
  try {
    const supabase = getSupabase();
    
    // Simple query to test connection
    const { data, error } = await supabase
      .from('messages')
      .select('count')
      .limit(1);

    if (error) {
      throw new DatabaseError('Database connection test failed', { error });
    }

    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error: error.message });
    throw error;
  }
};

/**
 * Health check for database
 */
export const healthCheck = async () => {
  try {
    await testConnection();
    return {
      status: 'healthy',
      message: 'Database connection is working'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message
    };
  }
};

export default {
  initializeDatabase,
  getSupabase,
  testConnection,
  healthCheck
};

