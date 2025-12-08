/**
 * Build user prompt for AI analysis
 */

/**
 * Build prompt for analyzing a single message
 * @param {object} message - Message data from database
 * @param {string} userCriteria - User-defined lead criteria
 * @returns {string} Formatted user prompt
 */
export const buildAnalysisPrompt = (message, userCriteria) => {
  const {
    chat_name,
    username,
    bio,
    message: messageText
  } = message;
  
  // Simplified, user-centric prompt
  const prompt = `КРИТЕРИИ ПОИСКА:
${userCriteria}

СООБЩЕНИЕ:
${messageText}
${bio ? `Био: ${bio}` : ''}
${chat_name ? `Канал: ${chat_name}` : ''}

ЗАДАЧА:
1. Определи тип сообщения: ЭТО ПОИСК (REQUEST) или ПРЕДЛОЖЕНИЕ (OFFER)?
   - Если человек пишет "Предлагаю", "Помогу", "Занимаемся", "Вебинар" -> is_match: false.
   - Если человек пишет "Ищу", "Нужно", "Требуется" -> переходи к шагу 2.

2. Проверь соответствие КРИТЕРИЯМ ПОИСКА.
   - Тема должна совпадать точно.
   - ВНИМАНИЕ: Разделяй критерии на "КОГО ИСКАТЬ" и "КОГО ИСКЛЮЧИТЬ".
   - Если сообщение совпадает с описанием из категории "исключения/не искать/конкуренты" -> is_match: false.

Верни JSON: { "is_match": boolean, "confidence_score": number, "reasoning": string }`;
  
  return prompt;
};

/**
 * Build prompt for testing user criteria
 * @param {string} userCriteria - User-defined criteria to test
 * @param {object} testMessage - Optional test message
 * @returns {string} Test prompt
 */
export const buildTestPrompt = (userCriteria, testMessage = null) => {
  const defaultTestMessage = {
    chat_name: 'Test Channel',
    first_name: 'John',
    last_name: 'Doe',
    username: 'johndoe',
    bio: 'Entrepreneur and business owner',
    message: 'Looking for a reliable marketing agency to help grow my e-commerce business. Budget is around $5k/month. Any recommendations?',
    message_time: new Date().toISOString()
  };
  
  const message = testMessage || defaultTestMessage;
  return buildAnalysisPrompt(message, userCriteria);
};

/**
 * Extract examples from user criteria for display
 * @param {string} userCriteria - User-defined criteria
 * @returns {array} Array of example criteria
 */
export const extractCriteria = (userCriteria) => {
  // Try to extract bullet points or numbered lists
  const bulletPoints = userCriteria.match(/[-•*]\s*(.+)/g) || [];
  const numberedPoints = userCriteria.match(/\d+\.\s*(.+)/g) || [];
  
  const criteria = [...bulletPoints, ...numberedPoints]
    .map(item => item.replace(/^[-•*\d.]\s*/, '').trim())
    .filter(item => item.length > 0);
  
  // If no structured criteria found, split by newlines
  if (criteria.length === 0) {
    return userCriteria
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 10); // Only meaningful lines
  }
  
  return criteria;
};

/**
 * Validate user criteria
 * @param {string} userCriteria - User-defined criteria to validate
 * @returns {object} Validation result
 */
export const validateCriteria = (userCriteria) => {
  if (!userCriteria || typeof userCriteria !== 'string') {
    return {
      valid: false,
      error: 'Criteria must be a non-empty string'
    };
  }
  
  const trimmed = userCriteria.trim();
  
  if (trimmed.length < 20) {
    return {
      valid: false,
      error: 'Criteria is too short. Please provide more detailed criteria (at least 20 characters)'
    };
  }
  
  if (trimmed.length > 5000) {
    return {
      valid: false,
      error: 'Criteria is too long. Please keep it under 5000 characters'
    };
  }
  
  // Check if criteria contains at least some meaningful content
  const words = trimmed.split(/\s+/).filter(w => w.length > 3);
  if (words.length < 5) {
    return {
      valid: false,
      error: 'Criteria appears too vague. Please provide more specific details'
    };
  }
  
  return {
    valid: true,
    extractedCriteria: extractCriteria(trimmed)
  };
};

/**
 * Get example prompts for users
 */
export const EXAMPLE_PROMPTS = [
  {
    title: 'Marketing Agency Leads',
    description: 'Find people looking for marketing and advertising services',
    prompt: `Find messages from people who are:
- Looking for marketing help or advertising services
- Mentioning website development or social media management
- Asking for recommendations for digital marketing agencies
- Expressing frustration with current marketing results
- Mentioning budget for marketing services
- Discussing ROI, conversion rates, or customer acquisition
- Looking for help with Google Ads, Facebook Ads, or SEO`
  },
  {
    title: 'SaaS Sales Leads',
    description: 'Identify potential customers for software products',
    prompt: `Identify potential leads who are:
- Looking for CRM software or project management tools
- Mentioning problems with team collaboration
- Asking about automation tools or productivity software
- Expressing need for better workflow management
- Mentioning they're a business owner or decision maker
- Discussing scaling their business or team
- Looking for integrations or API solutions`
  },
  {
    title: 'Freelance Developer Leads',
    description: 'Find clients looking for development services',
    prompt: `Find messages where someone is:
- Looking for a web developer or programmer
- Mentioning they need an app or website built
- Asking for development cost estimates
- Looking for technical help with a project
- Mentioning specific technologies (React, Node.js, Python, etc.)
- Discussing MVP development or startup projects
- Looking for full-stack, frontend, or backend developers`
  },
  {
    title: 'Real Estate Leads',
    description: 'Identify people interested in buying or selling property',
    prompt: `Find messages from people who are:
- Looking to buy or sell property
- Asking about real estate prices or market conditions
- Mentioning relocation or moving to a new area
- Looking for real estate agent recommendations
- Discussing mortgage, financing, or investment properties
- Asking about specific neighborhoods or areas
- Expressing interest in viewing properties`
  },
  {
    title: 'Coaching/Consulting Leads',
    description: 'Find people seeking professional guidance',
    prompt: `Identify people who are:
- Looking for business coaching or consulting
- Asking for career advice or guidance
- Expressing challenges with business growth or strategy
- Mentioning need for accountability or mentorship
- Discussing goals related to income, lifestyle, or business
- Looking for help with specific business problems
- Asking about courses, training, or professional development`
  }
];

export default {
  buildAnalysisPrompt,
  buildTestPrompt,
  extractCriteria,
  validateCriteria,
  EXAMPLE_PROMPTS
};
