import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { AIServiceError } from '../utils/errorHandler.js';

/**
 * OpenRouter client configuration
 * Using OpenAI SDK with OpenRouter base URL
 */

let openrouterClient = null;

/**
 * Initialize OpenRouter client
 * @param {string} apiKey - Optional API key (can use env var)
 */
export const initializeOpenRouter = (apiKey = null) => {
  try {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    
    if (!key) {
      throw new AIServiceError('OpenRouter API key is required');
    }

    openrouterClient = new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.YOUR_SITE_NAME || 'Telegram Lead Analyzer'
      }
    });

    logger.info('OpenRouter client initialized successfully');
    return openrouterClient;
  } catch (error) {
    logger.error('Failed to initialize OpenRouter client', { error: error.message });
    throw error;
  }
};

/**
 * Get OpenRouter client instance
 * @param {string} apiKey - Optional API key for user-specific client
 */
export const getOpenRouter = (apiKey = null) => {
  if (apiKey) {
    // Create new client instance for this specific API key
    return initializeOpenRouter(apiKey);
  }
  
  if (!openrouterClient) {
    return initializeOpenRouter();
  }
  
  return openrouterClient;
};

/**
 * Test OpenRouter connection
 * @param {string} apiKey - Optional API key to test
 */
export const testConnection = async (apiKey = null) => {
  try {
    const client = getOpenRouter(apiKey);
    const model = process.env.AI_MODEL || 'deepseek/deepseek-chat-v3.1';

    // Simple test request
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: 'Say "test successful" and nothing else.' }
      ],
      max_tokens: 10,
      temperature: 0
    });

    const result = response.choices[0]?.message?.content;
    
    if (!result) {
      throw new AIServiceError('No response from OpenRouter');
    }

    logger.info('OpenRouter connection test successful');
    return {
      success: true,
      message: 'Connection successful',
      response: result
    };
  } catch (error) {
    logger.error('OpenRouter connection test failed', { error: error.message });
    throw new AIServiceError('OpenRouter connection failed', { 
      originalError: error.message 
    });
  }
};

/**
 * Get available models
 */
export const getAvailableModels = async () => {
  try {
    const client = getOpenRouter();
    
    // OpenRouter models endpoint
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    logger.error('Failed to fetch available models', { error: error.message });
    throw error;
  }
};

/**
 * Health check for OpenRouter
 */
export const healthCheck = async () => {
  try {
    await testConnection();
    return {
      status: 'healthy',
      message: 'OpenRouter API is working'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message
    };
  }
};

export default {
  initializeOpenRouter,
  getOpenRouter,
  testConnection,
  getAvailableModels,
  healthCheck
};

