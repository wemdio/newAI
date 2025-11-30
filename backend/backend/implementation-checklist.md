# Project Implementation Checklist

## 📁 Recommended Project Structure

```
telegram-lead-analyzer/
├── src/
│   ├── config/
│   │   ├── database.js          # Supabase configuration
│   │   ├── openrouter.js        # OpenRouter client setup
│   │   └── telegram.js          # Telegram bot configuration
│   │
│   ├── services/
│   │   ├── messageAnalyzer.js   # Core AI analysis logic
│   │   ├── leadDetector.js      # Lead detection orchestration
│   │   ├── telegramPoster.js    # Post leads to channel
│   │   └── costOptimizer.js     # Usage tracking and limits
│   │
│   ├── validators/
│   │   ├── aiResponseValidator.js  # Validate AI responses
│   │   ├── messagePreFilter.js     # Pre-AI filtering
│   │   └── hallucinationCheck.js   # Anti-hallucination checks
│   │
│   ├── jobs/
│   │   ├── hourlyScanner.js     # Main cron job
│   │   └── scheduler.js         # Cron setup
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── config.js        # User configuration endpoints
│   │   │   ├── leads.js         # Leads management endpoints
│   │   │   └── analytics.js     # Usage analytics endpoints
│   │   ├── middleware/
│   │   │   ├── auth.js          # Authentication middleware
│   │   │   └── rateLimiter.js   # API rate limiting
│   │   └── server.js            # Express app setup
│   │
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_create_user_config.sql
│   │   │   ├── 002_create_detected_leads.sql
│   │   │   ├── 003_create_api_usage.sql
│   │   │   └── 004_create_processing_logs.sql
│   │   └── queries.js           # Database query functions
│   │
│   ├── prompts/
│   │   ├── systemPrompt.js      # AI system prompt
│   │   └── promptBuilder.js     # User prompt builder
│   │
│   ├── utils/
│   │   ├── logger.js            # Logging utility
│   │   ├── errorHandler.js      # Error handling
│   │   └── tokenCounter.js      # Token usage estimation
│   │
│   └── index.js                 # Application entry point
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConfigPanel.jsx
│   │   │   ├── LeadsTable.jsx
│   │   │   ├── AnalyticsDashboard.jsx
│   │   │   └── PromptTester.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Configuration.jsx
│   │   │   └── Leads.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   └── App.jsx
│   └── package.json
│
├── tests/
│   ├── unit/
│   │   ├── messageAnalyzer.test.js
│   │   ├── validator.test.js
│   │   └── preFilter.test.js
│   ├── integration/
│   │   └── fullWorkflow.test.js
│   └── fixtures/
│       └── testMessages.json
│
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── cursor-instructions.md       # This file!
```

## ✅ Phase-by-Phase Implementation Checklist

### Phase 1: Project Setup ⏱️ ~1-2 hours

- [ ] Initialize Node.js project
  ```bash
  npm init -y
  npm install express dotenv
  npm install @supabase/supabase-js
  npm install openai node-telegram-bot-api node-cron
  npm install --save-dev nodemon jest
  ```

- [ ] Create project structure (folders above)

- [ ] Set up `.env` file:
  ```
  SUPABASE_URL=<from MCP>
  SUPABASE_ANON_KEY=<from MCP>
  OPENROUTER_API_KEY=<user will provide>
  TELEGRAM_BOT_TOKEN=<from BotFather>
  TELEGRAM_CHANNEL_ID=<user will provide>
  PORT=3000
  NODE_ENV=development
  ```

- [ ] Create `.env.example` with placeholder values

- [ ] Set up `.gitignore`:
  ```
  node_modules/
  .env
  *.log
  dist/
  build/
  ```

- [ ] Initialize Git repository

### Phase 2: Database Setup ⏱️ ~2-3 hours

- [ ] Connect to Supabase using MCP credentials

- [ ] Create `user_config` table:
  ```sql
  CREATE TABLE user_config (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    openrouter_api_key TEXT,
    lead_prompt TEXT NOT NULL,
    telegram_channel_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] Create `detected_leads` table:
  ```sql
  CREATE TABLE detected_leads (
    id SERIAL PRIMARY KEY,
    message_id BIGINT REFERENCES messages(id),
    user_id UUID REFERENCES auth.users(id),
    confidence_score INT NOT NULL,
    reasoning TEXT NOT NULL,
    matched_criteria JSONB,
    posted_to_telegram BOOLEAN DEFAULT false,
    is_contacted BOOLEAN DEFAULT false,
    notes TEXT,
    detected_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] Create `api_usage` table:
  ```sql
  CREATE TABLE api_usage (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    cost DECIMAL(10, 6) NOT NULL,
    input_tokens INT NOT NULL,
    output_tokens INT NOT NULL,
    model_used TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] Create `processing_logs` table:
  ```sql
  CREATE TABLE processing_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    messages_fetched INT NOT NULL,
    messages_analyzed INT NOT NULL,
    messages_skipped INT NOT NULL,
    leads_found INT NOT NULL,
    processing_duration_ms INT NOT NULL,
    errors TEXT[],
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] Create indexes:
  ```sql
  CREATE INDEX idx_detected_leads_user ON detected_leads(user_id);
  CREATE INDEX idx_detected_leads_time ON detected_leads(detected_at);
  CREATE INDEX idx_api_usage_user_time ON api_usage(user_id, timestamp);
  ```

- [ ] Test database connection with sample query

### Phase 3: Core AI Service ⏱️ ~4-6 hours

- [ ] Create OpenRouter client (`src/config/openrouter.js`)

- [ ] Implement system prompt (`src/prompts/systemPrompt.js`)

- [ ] Build prompt builder (`src/prompts/promptBuilder.js`)

- [ ] Implement message analyzer (`src/services/messageAnalyzer.js`)
  - [ ] AI call function
  - [ ] Response parsing
  - [ ] Error handling
  - [ ] Token counting

- [ ] Create AI response validator (`src/validators/aiResponseValidator.js`)
  - [ ] Structure validation
  - [ ] Confidence check
  - [ ] Reasoning validation
  - [ ] Quote verification

- [ ] Build hallucination checker (`src/validators/hallucinationCheck.js`)
  - [ ] Keyword extraction
  - [ ] Reference checking
  - [ ] Uncertainty detection

- [ ] Test with sample messages

### Phase 4: Message Processing ⏱️ ~3-4 hours

- [ ] Create pre-filter service (`src/validators/messagePreFilter.js`)
  - [ ] Keyword extraction
  - [ ] Basic matching
  - [ ] Length checks
  - [ ] Contact info validation

- [ ] Implement lead detector orchestrator (`src/services/leadDetector.js`)
  - [ ] Fetch messages from Supabase
  - [ ] Apply pre-filtering
  - [ ] Call AI analyzer
  - [ ] Validate results
  - [ ] Save to database

- [ ] Add cost optimizer (`src/services/costOptimizer.js`)
  - [ ] Usage tracking
  - [ ] Budget checking
  - [ ] Cost calculation
  - [ ] Usage statistics

- [ ] Test full processing pipeline

### Phase 5: Telegram Integration ⏱️ ~2-3 hours

- [ ] Create Telegram bot with BotFather
  - [ ] Use /newbot command
  - [ ] Get bot token
  - [ ] Save to .env

- [ ] Set up Telegram client (`src/config/telegram.js`)

- [ ] Implement message formatter (`src/services/telegramPoster.js`)
  - [ ] Format lead information
  - [ ] Add Markdown formatting
  - [ ] Include all required fields

- [ ] Add posting function
  - [ ] Send message to channel
  - [ ] Error handling
  - [ ] Retry logic

- [ ] Test posting to private channel
  - [ ] Make bot admin of channel
  - [ ] Test message format
  - [ ] Verify all fields display

### Phase 6: Scheduling System ⏱️ ~2-3 hours

- [ ] Set up node-cron (`src/jobs/scheduler.js`)

- [ ] Create hourly scanner job (`src/jobs/hourlyScanner.js`)
  - [ ] Cron expression: `0 * * * *`
  - [ ] Get user configurations
  - [ ] Process each active user
  - [ ] Log results

- [ ] Implement job flow:
  - [ ] Fetch last hour messages
  - [ ] Pre-filter messages
  - [ ] Analyze with AI
  - [ ] Validate results
  - [ ] Save leads
  - [ ] Post to Telegram
  - [ ] Log statistics

- [ ] Add error handling and recovery

- [ ] Test manual job execution

### Phase 7: API Backend ⏱️ ~4-5 hours

- [ ] Set up Express server (`src/api/server.js`)

- [ ] Add authentication middleware (`src/api/middleware/auth.js`)

- [ ] Create configuration endpoints (`src/api/routes/config.js`)
  - [ ] GET /api/config - Get user config
  - [ ] POST /api/config - Save config
  - [ ] PUT /api/config - Update config
  - [ ] POST /api/config/test - Test prompt

- [ ] Create leads endpoints (`src/api/routes/leads.js`)
  - [ ] GET /api/leads - List all leads
  - [ ] GET /api/leads/:id - Get single lead
  - [ ] PUT /api/leads/:id - Update lead status
  - [ ] DELETE /api/leads/:id - Delete lead
  - [ ] GET /api/leads/export - Export to CSV

- [ ] Create analytics endpoints (`src/api/routes/analytics.js`)
  - [ ] GET /api/analytics/usage - Usage statistics
  - [ ] GET /api/analytics/performance - Performance metrics
  - [ ] GET /api/analytics/leads - Lead statistics

- [ ] Add request validation

- [ ] Implement error handling middleware

- [ ] Test all endpoints with Postman/Thunder Client

### Phase 8: Frontend Development ⏱️ ~6-8 hours

- [ ] Set up React/Next.js project

- [ ] Create layout structure
  - [ ] Navigation
  - [ ] Sidebar
  - [ ] Main content area

- [ ] Build Configuration Page
  - [ ] API key input (encrypted)
  - [ ] Prompt textarea with examples
  - [ ] Channel ID input
  - [ ] Active/inactive toggle
  - [ ] Test prompt button
  - [ ] Save button

- [ ] Build Leads Dashboard
  - [ ] Table with sorting/filtering
  - [ ] Lead detail modal
  - [ ] Status update buttons
  - [ ] Export button
  - [ ] Search functionality

- [ ] Build Analytics Dashboard
  - [ ] Usage charts
  - [ ] Cost tracking
  - [ ] Lead statistics
  - [ ] Performance metrics

- [ ] Add prompt testing interface
  - [ ] Sample messages
  - [ ] Real-time testing
  - [ ] Confidence visualization

- [ ] Implement API integration

- [ ] Add loading states and error handling

- [ ] Make responsive for mobile

### Phase 9: Testing ⏱️ ~3-4 hours

- [ ] Write unit tests
  - [ ] Test message pre-filter
  - [ ] Test AI response validator
  - [ ] Test prompt builder
  - [ ] Test cost calculator

- [ ] Write integration tests
  - [ ] Test full message processing flow
  - [ ] Test database operations
  - [ ] Test API endpoints

- [ ] Create test fixtures
  - [ ] Sample messages (positive/negative)
  - [ ] Sample AI responses
  - [ ] Sample user configs

- [ ] Manual testing
  - [ ] Test with real Telegram data
  - [ ] Test edge cases
  - [ ] Test error scenarios

- [ ] Load testing
  - [ ] Test with 1000+ messages
  - [ ] Measure processing time
  - [ ] Check memory usage

### Phase 10: Deployment ⏱️ ~2-3 hours

- [ ] Set up environment variables in production

- [ ] Configure production database

- [ ] Deploy backend
  - [ ] Choose hosting (Heroku, Railway, DigitalOcean)
  - [ ] Set up Node.js environment
  - [ ] Configure environment variables
  - [ ] Test deployment

- [ ] Deploy frontend
  - [ ] Build production bundle
  - [ ] Deploy to Vercel/Netlify
  - [ ] Configure API endpoint

- [ ] Set up monitoring
  - [ ] Error tracking (Sentry)
  - [ ] Performance monitoring
  - [ ] Uptime monitoring

- [ ] Configure backups
  - [ ] Database backups
  - [ ] Logs backup

- [ ] Document deployment process

## 🔍 Quality Assurance Checklist

### Functionality
- [ ] Messages processed every hour automatically
- [ ] Only messages from last hour are analyzed
- [ ] AI correctly identifies matching messages
- [ ] No false positives (hallucinations)
- [ ] Leads posted to Telegram with correct format
- [ ] All lead data displayed in dashboard
- [ ] User can configure settings via UI
- [ ] Export functionality works

### Performance
- [ ] Processes 1000 messages in < 5 minutes
- [ ] API responds in < 500ms
- [ ] Frontend loads in < 2 seconds
- [ ] No memory leaks over 24 hours
- [ ] Database queries optimized

### Security
- [ ] API keys encrypted in database
- [ ] Authentication on all endpoints
- [ ] Rate limiting implemented
- [ ] SQL injection prevention
- [ ] XSS prevention in frontend

### Cost Efficiency
- [ ] Pre-filtering reduces AI calls by 70%+
- [ ] Cost per 100k messages < $5
- [ ] Usage tracking accurate
- [ ] Budget limits enforced

### Reliability
- [ ] Error handling on all async operations
- [ ] Failed jobs don't crash system
- [ ] Retry logic for API failures
- [ ] Detailed error logging
- [ ] Graceful degradation

## 📊 Success Metrics

Track these metrics after deployment:

- **Processing Metrics**
  - Messages analyzed per hour
  - Average processing time per message
  - Pre-filter pass rate (% sent to AI)

- **Quality Metrics**
  - Lead detection accuracy (manual validation)
  - False positive rate (< 10% target)
  - Average confidence score of detected leads

- **Cost Metrics**
  - Cost per message analyzed
  - Total monthly AI costs
  - Cost per lead found

- **System Metrics**
  - Job success rate (> 99% target)
  - API uptime (> 99.9% target)
  - Error rate (< 1% target)

- **User Metrics**
  - Active users
  - Leads detected per user
  - User satisfaction with lead quality

## 🚀 Quick Start Commands

```bash
# Development
npm run dev              # Start backend with nodemon
npm run frontend         # Start frontend dev server

# Testing
npm test                 # Run unit tests
npm run test:integration # Run integration tests
npm run test:coverage    # Generate coverage report

# Production
npm run build            # Build frontend
npm start                # Start production server

# Database
npm run migrate          # Run database migrations
npm run seed             # Seed test data

# Utilities
npm run lint             # Lint code
npm run format           # Format code with Prettier
```

## 📝 Environment Variables Reference

```bash
# Database
SUPABASE_URL=<from MCP>
SUPABASE_ANON_KEY=<from MCP>

# AI Service
OPENROUTER_API_KEY=<user configures in UI>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=google/gemini-2.0-flash-001

# Telegram
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_CHANNEL_ID=<user configures in UI>

# Server
PORT=3000
NODE_ENV=production
API_BASE_URL=https://your-domain.com/api

# Security
JWT_SECRET=<generate random string>
ENCRYPTION_KEY=<generate random 32 char string>

# Limits
MONTHLY_BUDGET_USD=50
MAX_MESSAGES_PER_HOUR=10000

# Monitoring
SENTRY_DSN=<optional>
LOG_LEVEL=info
```

## 🎯 Final Pre-Launch Checklist

- [ ] All tests passing
- [ ] Documentation complete
- [ ] Error monitoring configured
- [ ] Database backed up
- [ ] Environment variables set
- [ ] SSL certificate configured
- [ ] Domain configured
- [ ] User guide written
- [ ] Demo video recorded
- [ ] Support email set up

---

**Total Estimated Time: 35-45 hours**

Start with Phase 1 and work sequentially. Each phase should be fully tested before moving to the next!