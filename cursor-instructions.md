# Cursor AI Prompt: Telegram Lead Scanner & Analyzer

## 🎯 Project Overview

You are building a **Telegram Lead Scanner & Analyzer** - an intelligent system that automatically analyzes messages from Telegram channels every hour and identifies potential leads based on user-defined criteria using AI. This is a production-ready Node.js application with zero tolerance for AI hallucinations.

## 📋 System Architecture

### Technology Stack
- **Runtime**: Node.js (v18+)
- **Database**: Supabase (connect via MCP - credentials already available)
- **AI Model**: `google/gemini-2.0-flash-001` via OpenRouter API
- **Telegram Bot**: `node-telegram-bot-api`
- **Scheduler**: `node-cron`
- **Web Framework**: Express.js
- **Frontend**: React or Next.js

### Existing Infrastructure
The project builds upon an existing message collection system that:
- Collects messages from Telegram channels hourly
- Stores data in Supabase `messages` table with the following schema:

```
messages table structure:
- id (int8, primary key)
- message_time (timestamptz)
- chat_name (text)
- first_name (text)
- last_name (text)
- username (text)
- bio (text)
- message (text)
- created_at (timestamptz)
- user_id (int8)
- profile_link (text)
```

## 🚀 Core Functionality Requirements

### 1. Hourly Message Analysis Job

**Objective**: Every hour, automatically scan messages from the last hour and identify leads.

**Implementation Requirements**:
- Use `node-cron` to schedule job every hour (e.g., `0 * * * *`)
- Query Supabase for messages where `message_time >= NOW() - INTERVAL '1 hour'`
- Filter logic in JavaScript:
  ```javascript
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .gte('message_time', oneHourAgo.toISOString())
    .order('message_time', { ascending: false });
  ```

### 2. AI-Powered Lead Detection System

**Critical Requirement**: ZERO HALLUCINATIONS - The AI must ONLY analyze existing messages and NEVER fabricate information.

**Implementation Strategy**:

#### A. Prompt Engineering for Accuracy
```javascript
const systemPrompt = `You are a lead qualification expert. Your task is to analyze Telegram messages and determine if they match specific criteria.

CRITICAL RULES:
1. ONLY analyze the exact message text provided
2. NEVER invent or assume information not present in the message
3. If you cannot determine a match with confidence, respond with "NO_MATCH"
4. Base your decision ONLY on the user's criteria and the actual message content
5. Provide specific reasoning citing exact phrases from the message

Output format (JSON):
{
  "is_match": boolean,
  "confidence_score": 0-100,
  "reasoning": "specific explanation citing exact message content",
  "matched_criteria": ["criterion1", "criterion2"]
}`;

const userPrompt = `
User's Lead Criteria:
${userDefinedPrompt}

Message to Analyze:
- Channel: ${chat_name}
- From: ${first_name} ${last_name} (@${username})
- Bio: ${bio}
- Message: ${message}
- Time: ${message_time}

Does this message match the criteria? Respond ONLY in JSON format.
`;
```

#### B. Validation & Anti-Hallucination Measures
1. **Confidence Threshold**: Only accept matches with confidence_score >= 70
2. **Reasoning Verification**: Check that reasoning contains actual quotes from the message
3. **Structured Output**: Force JSON response to prevent creative text generation
4. **Context Limiting**: Include ONLY necessary message data, no external context
5. **Multi-Stage Filtering**:
   - Pre-filter with keyword matching before AI analysis
   - Use AI only on pre-filtered candidates
   - Apply post-AI validation checks

#### C. OpenRouter API Integration
```javascript
const OpenAI = require('openai');

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.YOUR_SITE_URL,
    "X-Title": "Telegram Lead Analyzer"
  }
});

async function analyzeMessage(message, userCriteria) {
  try {
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(message, userCriteria) }
      ],
      temperature: 0.1, // Low temperature for consistency
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    // Validation layer
    if (result.confidence_score < 70) {
      return { is_match: false, reason: "Low confidence" };
    }
    
    if (!validateReasoning(result.reasoning, message.message)) {
      return { is_match: false, reason: "Invalid reasoning" };
    }
    
    return result;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return { is_match: false, reason: "Analysis failed" };
  }
}

function validateReasoning(reasoning, messageText) {
  // Check if reasoning contains actual quotes from message
  const words = messageText.toLowerCase().split(/\s+/);
  const reasoningLower = reasoning.toLowerCase();
  
  let matchCount = 0;
  for (const word of words) {
    if (word.length > 4 && reasoningLower.includes(word)) {
      matchCount++;
    }
  }
  
  // At least 20% of significant words should appear in reasoning
  return matchCount >= words.filter(w => w.length > 4).length * 0.2;
}
```

### 3. Telegram Bot Integration

**Objective**: Post found leads to a private channel with formatted messages.

**Implementation**:
```javascript
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

async function postLeadToChannel(lead, analysis) {
  const message = `
🎯 *NEW LEAD FOUND*

👤 *Contact Information*:
• Name: ${lead.first_name} ${lead.last_name}
• Username: @${lead.username}
• Bio: ${lead.bio || 'N/A'}
• Profile: ${lead.profile_link}

📱 *Source*:
• Channel: ${lead.chat_name}
• Time: ${new Date(lead.message_time).toLocaleString()}

💬 *Message*:
${lead.message}

🤖 *AI Analysis*:
• Confidence: ${analysis.confidence_score}%
• Matched Criteria: ${analysis.matched_criteria.join(', ')}
• Reasoning: ${analysis.reasoning}

---
Lead ID: ${lead.id}
  `.trim();

  try {
    await bot.sendMessage(
      process.env.TELEGRAM_CHANNEL_ID,
      message,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Failed to post to Telegram:', error);
  }
}
```

### 4. Web Interface

**User Configuration Panel**:
- OpenRouter API Key input (encrypted storage)
- Lead search prompt textarea (with examples)
- Target Telegram channel selection
- Active/Inactive toggle
- Test prompt functionality

**Leads Dashboard**:
- Table view of all found leads
- Filtering by date, channel, confidence
- Export functionality (CSV)
- Detailed view with full analysis
- Action buttons (mark as contacted, archive)

**Database Schema for Configuration**:
```sql
CREATE TABLE user_config (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES auth.users(id),
  openrouter_api_key TEXT ENCRYPTED,
  lead_prompt TEXT NOT NULL,
  telegram_channel_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE detected_leads (
  id SERIAL PRIMARY KEY,
  message_id INT REFERENCES messages(id),
  user_id INT REFERENCES auth.users(id),
  confidence_score INT NOT NULL,
  reasoning TEXT NOT NULL,
  matched_criteria JSONB,
  posted_to_telegram BOOLEAN DEFAULT false,
  is_contacted BOOLEAN DEFAULT false,
  notes TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🔐 Security & Best Practices

1. **API Key Management**:
   - Store OpenRouter API key encrypted in database
   - Use environment variables for bot token
   - Implement rate limiting on API calls

2. **Error Handling**:
   - Wrap all async operations in try-catch
   - Log errors to monitoring service
   - Implement retry logic with exponential backoff

3. **Performance Optimization**:
   - Batch process messages (max 50 at a time)
   - Implement caching for user configurations
   - Use connection pooling for Supabase

4. **Cost Control**:
   - Track OpenRouter API usage per user
   - Set monthly quotas
   - Implement pre-filtering to reduce AI calls
   - Gemini 2.0 Flash costs: $0.10/1M input tokens, $0.40/1M output tokens

## 📝 Implementation Steps

### Phase 1: Core Infrastructure
1. Set up project structure with proper folder organization
2. Configure Supabase connection using MCP
3. Create database tables for config and detected leads
4. Set up environment variables and secrets management

### Phase 2: Message Processing
1. Implement hourly cron job
2. Build Supabase query function for last hour messages
3. Create message batching logic
4. Add logging and monitoring

### Phase 3: AI Integration
1. Set up OpenRouter client
2. Implement prompt engineering system
3. Build validation and anti-hallucination checks
4. Add confidence scoring logic
5. Test with various message types

### Phase 4: Telegram Bot
1. Configure bot with BotFather
2. Implement message formatting
3. Add error handling for failed posts
4. Test posting to private channel

### Phase 5: Web Interface
1. Build Express.js API endpoints
2. Create React/Next.js frontend
3. Implement configuration forms
4. Build leads dashboard with filtering
5. Add authentication and authorization

### Phase 6: Testing & Deployment
1. Unit tests for core functions
2. Integration tests for full workflow
3. Load testing for message processing
4. Deploy to production environment
5. Set up monitoring and alerts

## 🎯 Success Criteria

- ✅ Messages are processed every hour without failures
- ✅ Zero false positive leads (no hallucinations)
- ✅ Lead detection accuracy > 80% based on user criteria
- ✅ All found leads posted to Telegram within 5 minutes
- ✅ Web interface loads in < 2 seconds
- ✅ System handles 10,000+ messages per hour
- ✅ OpenRouter API costs < $5 per 100,000 messages analyzed

## 💡 Prompt Examples for Users

Provide these examples in the UI to help users write effective prompts:

**Example 1 - Marketing Agency Leads**:
```
Find messages from people who are:
- Looking for marketing help or advertising services
- Mentioning website development or social media management
- Asking for recommendations for digital marketing agencies
- Expressing frustration with current marketing results
- Mentioning budget for marketing services
```

**Example 2 - SaaS Sales Leads**:
```
Identify potential leads who are:
- Looking for CRM software or project management tools
- Mentioning problems with team collaboration
- Asking about automation tools
- Expressing need for better workflow management
- Mentioning they're a business owner or decision maker
```

**Example 3 - Freelance Developer Leads**:
```
Find messages where someone is:
- Looking for a web developer or programmer
- Mentioning they need an app or website built
- Asking for development cost estimates
- Looking for technical help with a project
- Mentioning specific technologies (React, Node.js, Python, etc.)
```

## 🚨 Critical Reminders

1. **Use Supabase MCP**: Do NOT manually configure Supabase credentials. Cursor has access to MCP with existing connection.

2. **Anti-Hallucination Priority**: This is THE most important feature. Implement multiple validation layers.

3. **Incremental Development**: Build and test each component independently before integration.

4. **Real-Time Logging**: Log every AI decision with input/output for debugging.

5. **User Feedback Loop**: Allow users to mark false positives/negatives to improve prompts.

## 📚 Additional Resources

- OpenRouter Docs: https://openrouter.ai/docs
- Gemini 2.0 Flash Model: https://openrouter.ai/google/gemini-2.0-flash-001
- Supabase JS Client: https://supabase.com/docs/reference/javascript
- node-telegram-bot-api: https://github.com/yagop/node-telegram-bot-api
- Node-cron: https://www.npmjs.com/package/node-cron

## 🔄 Future Enhancements (Not Implemented Now)

- Auto-contacting leads (future phase)
- Multi-language support
- Advanced analytics dashboard
- Machine learning feedback loop for prompt optimization
- Integration with CRM systems

---

**Start by acknowledging this prompt and outlining your implementation plan in 5-8 steps.**