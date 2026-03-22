import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { AIServiceError } from '../utils/errorHandler.js';

let _tracer = null;
try {
  const api = await import('@opentelemetry/api');
  _tracer = api.trace.getTracer('lead-scanner-backend');
} catch { /* tracing not available */ }

function _wrapClient(client) {
  if (!_tracer) return client;

  const origChat = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = async function tracedCreate(params) {
    const span = _tracer.startSpan('llm_call', {
      attributes: {
        'openinference.span.kind': 'LLM',
        'llm.model_name': params.model || '',
        'llm.invocation_parameters': JSON.stringify({
          temperature: params.temperature,
          max_tokens: params.max_tokens,
        }),
        'input.value': JSON.stringify(params.messages || []).substring(0, 4000),
      },
    });
    try {
      const res = await origChat(params);
      const content = res.choices?.[0]?.message?.content || '';
      span.setAttribute('output.value', content.substring(0, 4000));
      if (res.usage) {
        span.setAttribute('llm.token_count.prompt', res.usage.prompt_tokens || 0);
        span.setAttribute('llm.token_count.completion', res.usage.completion_tokens || 0);
        span.setAttribute('llm.token_count.total', res.usage.total_tokens || 0);
      }

      if (params.response_format?.type === 'json_object' || content.trimStart().startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          span.setAttribute('eval.valid_json', true);
          const required = ['is_lead', 'confidence', 'reasoning'];
          const present = required.filter(f => parsed[f] !== undefined);
          span.setAttribute('eval.has_required_fields', present.length === required.length);
          span.setAttribute('eval.missing_fields', required.filter(f => parsed[f] === undefined).join(',') || '');
        } catch {
          span.setAttribute('eval.valid_json', false);
          span.setAttribute('eval.has_required_fields', false);
        }
      }

      span.end();
      return res;
    } catch (e) {
      span.setAttribute('error.message', e.message);
      span.setStatus({ code: 2, message: e.message });
      span.end();
      throw e;
    }
  };

  if (client.embeddings?.create) {
    const origEmb = client.embeddings.create.bind(client.embeddings);
    client.embeddings.create = async function tracedEmbedding(params) {
      const span = _tracer.startSpan('embedding', {
        attributes: {
          'openinference.span.kind': 'EMBEDDING',
          'llm.model_name': params.model || '',
        },
      });
      try {
        const res = await origEmb(params);
        span.end();
        return res;
      } catch (e) {
        span.setAttribute('error.message', e.message);
        span.setStatus({ code: 2, message: e.message });
        span.end();
        throw e;
      }
    };
  }

  return client;
}

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

    // Ensure we have valid headers required by OpenRouter to avoid 403 errors
    const siteUrl = process.env.YOUR_SITE_URL || 'https://telegram-scanner.ru';
    const siteName = process.env.YOUR_SITE_NAME || 'Telegram Lead Scanner';

    openrouterClient = _wrapClient(new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://router.requesty.ai/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': siteUrl,
        'X-Title': siteName,
      }
    }));

    logger.info('OpenRouter client initialized successfully', { 
      siteUrl, 
      siteName 
    });
    
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
    const model = process.env.AI_MODEL || 'anthropic/claude-3-haiku';

    // Simple test request
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: 'Say "test successful" and nothing else.' }
      ],
      max_tokens: 10,
      temperature: 0,
      // Provider filtering - use only specified providers
      provider: {
        order: ['DeepInfra', 'Novita', 'GMICloud', 'Ncompass', 'SiliconFlow'],
        allow_fallbacks: false,
        quantizations: ['fp4', 'fp8']
      }
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
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://router.requesty.ai/v1';
    const response = await fetch(`${baseUrl}/models`, {
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
