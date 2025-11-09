# Telegram Lead Scanner & Analyzer - Backend

Intelligent system that automatically analyzes messages from Telegram channels every hour and identifies potential leads using AI.

## 🚀 Features

- **Hourly Automated Scanning**: Processes messages from Telegram channels every hour
- **AI-Powered Lead Detection**: Uses Gemini 2.0 Flash via OpenRouter for intelligent lead qualification
- **Zero Hallucinations**: Multiple validation layers ensure accuracy
- **Telegram Integration**: Automatically posts found leads to your private channel
- **Web Dashboard**: Configure settings and view leads through web interface
- **Cost Optimization**: Pre-filtering and usage tracking to minimize AI costs

## 📋 Tech Stack

- **Runtime**: Node.js (v18+)
- **Database**: Supabase (PostgreSQL)
- **AI Model**: `google/gemini-2.0-flash-001` via OpenRouter
- **Telegram**: `node-telegram-bot-api`
- **Scheduler**: `node-cron`
- **Web Framework**: Express.js

## 🛠️ Installation

1. **Clone and install dependencies**:
```bash
cd backend
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Configure Supabase**:
   - Supabase credentials are provided via MCP
   - Run database migrations (see Database Setup section)

4. **Set up Telegram Bot**:
   - Create bot with [@BotFather](https://t.me/botfather)
   - Get bot token and add to `.env`
   - Add bot as admin to your private channel
   - Get channel ID and add to `.env`

5. **Get OpenRouter API Key**:
   - Sign up at [OpenRouter](https://openrouter.ai)
   - Generate API key
   - Add to `.env` or configure via web interface

## 📊 Database Setup

The system uses Supabase with the following tables:

### Existing Table
- `messages` - Contains collected Telegram messages (already exists)

### New Tables (to be created)
- `user_config` - User configurations and API keys
- `detected_leads` - Found leads with AI analysis results
- `api_usage` - Track OpenRouter API usage and costs
- `processing_logs` - Hourly job execution logs

Run migrations:
```bash
npm run migrate
```

## 🎯 Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Run Tests
```bash
npm test
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js      # Supabase setup
│   │   ├── openrouter.js    # OpenRouter client
│   │   └── telegram.js      # Telegram bot setup
│   │
│   ├── services/        # Core business logic
│   │   ├── messageAnalyzer.js   # AI analysis
│   │   ├── leadDetector.js      # Lead detection orchestration
│   │   ├── telegramPoster.js    # Post to channel
│   │   └── costOptimizer.js     # Usage tracking
│   │
│   ├── validators/      # Validation logic
│   │   ├── aiResponseValidator.js
│   │   ├── messagePreFilter.js
│   │   └── hallucinationCheck.js
│   │
│   ├── jobs/           # Scheduled tasks
│   │   ├── hourlyScanner.js
│   │   └── scheduler.js
│   │
│   ├── api/            # REST API
│   │   ├── routes/
│   │   │   ├── config.js
│   │   │   ├── leads.js
│   │   │   └── analytics.js
│   │   ├── middleware/
│   │   └── server.js
│   │
│   ├── database/       # Database layer
│   │   ├── migrations/
│   │   └── queries.js
│   │
│   ├── prompts/        # AI prompts
│   │   ├── systemPrompt.js
│   │   └── promptBuilder.js
│   │
│   ├── utils/          # Utilities
│   │   ├── logger.js
│   │   ├── errorHandler.js
│   │   └── tokenCounter.js
│   │
│   └── index.js        # Entry point
│
└── tests/              # Test files

```

## 🔐 Security

- API keys encrypted in database
- Rate limiting on all endpoints
- Input validation and sanitization
- Secure error handling
- Environment variable protection

## 💰 Cost Optimization

The system includes multiple layers to minimize AI costs:

1. **Pre-filtering**: Basic keyword matching before AI analysis
2. **Batch Processing**: Process messages in efficient batches
3. **Usage Tracking**: Monitor API costs per user
4. **Budget Limits**: Set monthly spending limits

**Expected costs**: ~$0.05 per 1,000 messages analyzed

## 📈 Monitoring

- Comprehensive logging with Winston
- Processing statistics and metrics
- Error tracking and alerting
- Performance monitoring

## 🔄 How It Works

1. **Hourly Job**: Cron job runs every hour (`:00` minute)
2. **Fetch Messages**: Query Supabase for messages from last hour
3. **Pre-Filter**: Apply keyword matching to reduce AI calls
4. **AI Analysis**: Send candidates to Gemini 2.0 Flash for analysis
5. **Validation**: Multiple checks to prevent hallucinations
6. **Save Leads**: Store detected leads in database
7. **Post to Telegram**: Send formatted message to private channel
8. **Log Results**: Record statistics and costs

## 🎯 Anti-Hallucination Measures

This system has ZERO TOLERANCE for AI hallucinations:

1. **Structured Output**: Force JSON response format
2. **Confidence Threshold**: Only accept matches ≥70% confidence
3. **Reasoning Verification**: Check reasoning contains actual message quotes
4. **Context Limiting**: Provide only necessary data to AI
5. **Multi-Stage Filtering**: Pre-AI and post-AI validation
6. **Quote Validation**: Verify AI reasoning references actual message content

## 📝 API Endpoints

### Configuration
- `GET /api/config` - Get user configuration
- `POST /api/config` - Save configuration
- `POST /api/config/test` - Test lead detection prompt

### Leads Management
- `GET /api/leads` - List all leads (with filtering)
- `GET /api/leads/:id` - Get single lead details
- `PUT /api/leads/:id` - Update lead status
- `GET /api/leads/export` - Export leads to CSV

### Analytics
- `GET /api/analytics/usage` - API usage statistics
- `GET /api/analytics/performance` - Processing metrics
- `GET /api/analytics/leads` - Lead statistics

## 🐛 Troubleshooting

### Cron job not running
- Check system time is correct
- Verify cron expression
- Check logs for errors

### AI not finding leads
- Test your prompt with sample messages
- Lower confidence threshold temporarily
- Check OpenRouter API key is valid

### Telegram posting fails
- Verify bot is admin of channel
- Check channel ID format (should include `-100`)
- Ensure bot token is correct

## 📄 License

MIT

## 🤝 Support

For issues and questions, please open an issue on GitHub.

