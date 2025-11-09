# Technical Specification: Anti-Hallucination Lead Detection

## 🎯 Objective
Create a bulletproof system that prevents AI from fabricating leads or making incorrect assessments.

## 🛡️ Multi-Layer Validation Strategy

### Layer 1: Pre-AI Filtering (Cost Optimization)
Before sending messages to AI, apply basic filtering to reduce unnecessary API calls:

```javascript
function preFilterMessage(message, userConfig) {
  // Extract keywords from user prompt
  const keywords = extractKeywords(userConfig.lead_prompt);
  
  if (keywords.length > 0) {
    const messageText = `${message.message} ${message.bio}`.toLowerCase();
    
    // Require at least one keyword match
    const hasKeyword = keywords.some(kw => 
      messageText.includes(kw.toLowerCase())
    );
    
    if (!hasKeyword) {
      return false; // Skip AI analysis
    }
  }
  
  // Additional filters
  if (message.message.length < 20) return false; // Too short
  if (!message.username && !message.first_name) return false; // No contact info
  
  return true; // Proceed to AI analysis
}

function extractKeywords(prompt) {
  // Extract important nouns and phrases from user prompt
  // This can be enhanced with NLP libraries
  const stopWords = ['the', 'is', 'at', 'which', 'on', 'a', 'an'];
  const words = prompt.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.includes(w));
  
  return [...new Set(words)]; // Remove duplicates
}
```

### Layer 2: AI Prompt Design (Hallucination Prevention)

**Principle**: Constrain AI responses to prevent creative interpretation.

```javascript
const SYSTEM_PROMPT = `You are a lead qualification analyst. Your ONLY task is to determine if a message matches specific criteria.

STRICT RULES:
1. Analyze ONLY the provided message text
2. Do NOT infer information not explicitly stated
3. Do NOT assume intent beyond what is written
4. If uncertain, respond "NO_MATCH"
5. Your reasoning MUST quote the actual message

Example of CORRECT analysis:
Message: "Looking for a developer to build a mobile app"
Criteria: "Find people looking for developers"
Response: {"is_match": true, "confidence": 90, "reasoning": "User explicitly states 'Looking for a developer'"}

Example of INCORRECT analysis:
Message: "My app keeps crashing"
Criteria: "Find people looking for developers"
Response: {"is_match": true, "reasoning": "They might need a developer"} ❌ WRONG - this is assumption

Response format (strict JSON):
{
  "is_match": true/false,
  "confidence_score": 0-100,
  "reasoning": "quote from message showing match",
  "matched_criteria": ["specific criterion matched"],
  "quoted_phrases": ["exact phrases from message"]
}`;

function buildAnalysisPrompt(message, criteria) {
  return `
LEAD CRITERIA:
${criteria}

MESSAGE TO ANALYZE:
Channel: ${message.chat_name}
From: ${message.first_name} ${message.last_name} (@${message.username})
Bio: ${message.bio || "N/A"}
Message Text: "${message.message}"
Timestamp: ${message.message_time}

TASK: Does this message match the criteria? 
- If YES: provide confidence score (70-100) and quote matching phrases
- If NO: respond with is_match: false, confidence_score: 0
- If UNCERTAIN: respond with is_match: false, confidence_score: 0

Respond ONLY with valid JSON. No additional text.
  `.trim();
}
```

### Layer 3: Response Validation (Post-AI Checks)

```javascript
function validateAIResponse(aiResponse, originalMessage) {
  const validations = {
    passed: [],
    failed: []
  };
  
  // 1. Check JSON structure
  const requiredFields = ['is_match', 'confidence_score', 'reasoning'];
  for (const field of requiredFields) {
    if (!(field in aiResponse)) {
      validations.failed.push(`Missing field: ${field}`);
    } else {
      validations.passed.push(`Has field: ${field}`);
    }
  }
  
  // 2. Confidence score validation
  if (aiResponse.confidence_score < 70) {
    validations.failed.push('Confidence too low');
    return { valid: false, validations };
  }
  validations.passed.push('Confidence >= 70');
  
  // 3. Reasoning must reference actual message content
  const messageWords = extractSignificantWords(originalMessage.message);
  const bioWords = extractSignificantWords(originalMessage.bio || '');
  const allWords = [...messageWords, ...bioWords];
  
  const reasoningLower = aiResponse.reasoning.toLowerCase();
  let wordMatchCount = 0;
  
  for (const word of allWords) {
    if (reasoningLower.includes(word.toLowerCase())) {
      wordMatchCount++;
    }
  }
  
  const matchPercentage = (wordMatchCount / allWords.length) * 100;
  
  if (matchPercentage < 15) {
    validations.failed.push(`Reasoning doesn't reference message (${matchPercentage.toFixed(1)}% match)`);
    return { valid: false, validations };
  }
  validations.passed.push(`Reasoning references message (${matchPercentage.toFixed(1)}% match)`);
  
  // 4. Check for hallucination keywords
  const hallucinationKeywords = [
    'probably', 'likely', 'might', 'could be', 'suggests', 
    'implies', 'seems', 'appears', 'possibly', 'maybe'
  ];
  
  for (const keyword of hallucinationKeywords) {
    if (reasoningLower.includes(keyword)) {
      validations.failed.push(`Contains uncertain language: "${keyword}"`);
      return { valid: false, validations };
    }
  }
  validations.passed.push('No uncertain language detected');
  
  // 5. Check quoted_phrases if present
  if (aiResponse.quoted_phrases && aiResponse.quoted_phrases.length > 0) {
    let validQuotes = 0;
    for (const quote of aiResponse.quoted_phrases) {
      if (originalMessage.message.toLowerCase().includes(quote.toLowerCase())) {
        validQuotes++;
      }
    }
    
    if (validQuotes === 0) {
      validations.failed.push('Quoted phrases not found in original message');
      return { valid: false, validations };
    }
    validations.passed.push(`${validQuotes}/${aiResponse.quoted_phrases.length} quotes verified`);
  }
  
  return {
    valid: validations.failed.length === 0,
    validations
  };
}

function extractSignificantWords(text) {
  if (!text) return [];
  
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
    'in', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'was', 'were',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it'
  ]);
  
  return text.toLowerCase()
    .split(/\W+/)
    .filter(word => 
      word.length > 3 && 
      !stopWords.has(word) &&
      !/^\d+$/.test(word) // exclude pure numbers
    );
}
```

### Layer 4: Confidence Calibration

```javascript
async function analyzeWithCalibration(message, criteria, openrouterClient) {
  // First pass: Get AI response
  const response = await openrouterClient.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildAnalysisPrompt(message, criteria) }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });
  
  let aiResult = JSON.parse(response.choices[0].message.content);
  
  // Validation layer
  const validation = validateAIResponse(aiResult, message);
  
  if (!validation.valid) {
    console.log('Validation failed:', validation.validations.failed);
    return {
      is_match: false,
      confidence_score: 0,
      reasoning: `Failed validation: ${validation.validations.failed.join(', ')}`,
      validation_details: validation
    };
  }
  
  // Calibrate confidence based on validation strength
  const calibrationFactor = calculateCalibrationFactor(validation);
  aiResult.confidence_score = Math.floor(aiResult.confidence_score * calibrationFactor);
  aiResult.validation_details = validation;
  
  return aiResult;
}

function calculateCalibrationFactor(validation) {
  let factor = 1.0;
  
  // Reduce confidence if validation is marginal
  const passedCount = validation.passed.length;
  const totalChecks = passedCount + validation.failed.length;
  
  if (passedCount < totalChecks * 0.8) {
    factor *= 0.9; // Reduce confidence by 10%
  }
  
  return Math.max(factor, 0.7); // Never reduce below 70% of original
}
```

## 💰 Cost Optimization Strategy

### OpenRouter Gemini 2.0 Flash Pricing:
- Input: $0.10 per 1M tokens
- Output: $0.40 per 1M tokens

### Estimated Costs:
- Average message: ~100 tokens (message + bio + context)
- Average response: ~50 tokens
- Cost per analysis: ~$0.00002 (2/100ths of a cent)
- 10,000 messages: ~$0.20
- 100,000 messages: ~$2.00

### Optimization Strategies:

```javascript
class CostOptimizer {
  constructor() {
    this.monthlyBudget = 50; // $50/month
    this.currentSpend = 0;
    this.analyzedCount = 0;
  }
  
  async canAnalyze() {
    const estimatedCost = 0.00002; // per message
    return (this.currentSpend + estimatedCost) < this.monthlyBudget;
  }
  
  trackUsage(inputTokens, outputTokens) {
    const cost = (inputTokens * 0.10 / 1000000) + (outputTokens * 0.40 / 1000000);
    this.currentSpend += cost;
    this.analyzedCount++;
    
    // Log to database for user dashboard
    this.logUsage(cost, inputTokens, outputTokens);
  }
  
  async logUsage(cost, inputTokens, outputTokens) {
    // Save to Supabase for analytics
    await supabase.from('api_usage').insert({
      user_id: this.userId,
      cost: cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      timestamp: new Date().toISOString()
    });
  }
  
  getUsageStats() {
    return {
      spend: this.currentSpend.toFixed(4),
      analyzed: this.analyzedCount,
      avgCost: (this.currentSpend / this.analyzedCount).toFixed(6),
      budgetRemaining: (this.monthlyBudget - this.currentSpend).toFixed(2)
    };
  }
}
```

## 🔄 Complete Processing Pipeline

```javascript
async function processHourlyMessages() {
  console.log('Starting hourly message processing...');
  
  // 1. Fetch messages from last hour
  const messages = await fetchLastHourMessages();
  console.log(`Fetched ${messages.length} messages`);
  
  // 2. Get user configuration
  const config = await getUserConfig();
  
  if (!config.is_active) {
    console.log('Analysis is disabled');
    return;
  }
  
  // 3. Initialize services
  const openrouterClient = initOpenRouter(config.openrouter_api_key);
  const costOptimizer = new CostOptimizer(config.user_id);
  
  // 4. Process messages
  const leads = [];
  let processed = 0;
  let skipped = 0;
  
  for (const message of messages) {
    // Pre-filter
    if (!preFilterMessage(message, config)) {
      skipped++;
      continue;
    }
    
    // Check budget
    if (!await costOptimizer.canAnalyze()) {
      console.log('Monthly budget reached');
      break;
    }
    
    // AI Analysis
    const result = await analyzeWithCalibration(
      message,
      config.lead_prompt,
      openrouterClient
    );
    
    processed++;
    
    // Track usage (tokens from response.usage)
    costOptimizer.trackUsage(
      result.usage?.input_tokens || 0,
      result.usage?.output_tokens || 0
    );
    
    // Save lead if matched
    if (result.is_match && result.confidence_score >= 70) {
      const leadId = await saveDetectedLead(message, result, config.user_id);
      leads.push({ id: leadId, message, result });
      
      // Post to Telegram
      await postLeadToTelegram(message, result, config.telegram_channel_id);
    }
  }
  
  console.log(`Processing complete: ${processed} analyzed, ${skipped} skipped, ${leads.length} leads found`);
  
  // Send summary notification
  await sendSummaryNotification(config, {
    processed,
    skipped,
    leadsFound: leads.length,
    usage: costOptimizer.getUsageStats()
  });
}
```

## 📊 Database Schema Extensions

```sql
-- API Usage Tracking
CREATE TABLE api_usage (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES auth.users(id),
  cost DECIMAL(10, 6) NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_time ON api_usage(user_id, timestamp);

-- Create view for monthly usage
CREATE VIEW monthly_usage AS
SELECT 
  user_id,
  DATE_TRUNC('month', timestamp) as month,
  SUM(cost) as total_cost,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  COUNT(*) as total_requests
FROM api_usage
GROUP BY user_id, DATE_TRUNC('month', timestamp);

-- Processing Logs
CREATE TABLE processing_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES auth.users(id),
  messages_fetched INT NOT NULL,
  messages_analyzed INT NOT NULL,
  messages_skipped INT NOT NULL,
  leads_found INT NOT NULL,
  processing_duration_ms INT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## 🧪 Testing Strategy

```javascript
// Test cases for validation
const testCases = [
  {
    name: "Direct match with quote",
    message: { message: "Looking for a React developer for my startup" },
    criteria: "Find people looking for developers",
    expectedMatch: true,
    minConfidence: 85
  },
  {
    name: "Indirect mention (should reject)",
    message: { message: "My developer quit, so frustrated" },
    criteria: "Find people looking for developers",
    expectedMatch: false, // Not explicitly looking
    reasoning: "Should not infer need from frustration"
  },
  {
    name: "Hallucination test",
    message: { message: "Working on my project" },
    criteria: "Find people looking for developers",
    expectedMatch: false,
    reasoning: "Should not assume they need help"
  }
];

async function runValidationTests() {
  for (const test of testCases) {
    console.log(`Testing: ${test.name}`);
    const result = await analyzeWithCalibration(test.message, test.criteria, client);
    
    const passed = result.is_match === test.expectedMatch;
    console.log(passed ? '✅ PASS' : '❌ FAIL');
    console.log(`  Expected: ${test.expectedMatch}, Got: ${result.is_match}`);
    console.log(`  Confidence: ${result.confidence_score}%`);
    console.log(`  Reasoning: ${result.reasoning}`);
  }
}
```

## 📈 Monitoring & Alerts

```javascript
// Set up alerts for anomalies
async function checkAnomalies() {
  const stats = await getRecentStats();
  
  // Alert if confidence scores are suspiciously high
  if (stats.avgConfidence > 95) {
    await sendAlert('Avg confidence too high - possible over-matching');
  }
  
  // Alert if match rate is too high
  if (stats.matchRate > 0.5) {
    await sendAlert('Match rate > 50% - criteria may be too broad');
  }
  
  // Alert if validation failures spike
  if (stats.validationFailureRate > 0.3) {
    await sendAlert('High validation failure rate - AI may be hallucinating');
  }
}
```

---

This technical specification provides the implementation details for a production-ready, hallucination-resistant lead detection system.