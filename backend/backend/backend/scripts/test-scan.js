import 'dotenv/config';
import { runHourlyScan } from '../src/jobs/hourlyScanner.js';
import { initializeDatabase } from '../src/config/database.js';
import logger from '../src/utils/logger.js';

/**
 * Manual test scan script
 * Use this to test the scanning process without waiting for cron
 */

async function testScan() {
  console.log('='.repeat(60));
  console.log('MANUAL TEST SCAN');
  console.log('='.repeat(60));
  
  try {
    // Initialize database
    console.log('\n1. Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Run scan
    console.log('\n2. Running hourly scan...');
    console.log('This may take a few minutes depending on message volume...\n');
    
    const results = await runHourlyScan();
    
    console.log('\n' + '='.repeat(60));
    console.log('SCAN RESULTS');
    console.log('='.repeat(60));
    console.log(`
📊 Summary:
- Users processed: ${results.usersProcessed}
- Users succeeded: ${results.usersSucceeded}
- Users failed: ${results.usersFailed}
- Total leads detected: ${results.totalLeadsDetected}
- Total leads posted: ${results.totalLeadsPosted}
- Duration: ${results.duration}ms

${results.errors.length > 0 ? `
⚠️  Errors:
${results.errors.map(e => `- ${e.userId}: ${e.error}`).join('\n')}
` : '✅ No errors'}
    `);
    
    // Show detailed results per user
    if (results.userResults.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('DETAILED RESULTS PER USER');
      console.log('='.repeat(60));
      
      results.userResults.forEach((userResult, index) => {
        console.log(`\n${index + 1}. User: ${userResult.userId || 'N/A'}`);
        
        if (userResult.success && userResult.detection) {
          const det = userResult.detection;
          console.log(`   Messages fetched: ${det.messagesFetched}`);
          console.log(`   Messages pre-filtered: ${det.messagesPreFiltered}`);
          console.log(`   Messages analyzed: ${det.messagesAnalyzed}`);
          console.log(`   Leads detected: ${det.leadsDetected}`);
          console.log(`   Total cost: $${det.totalCost.toFixed(6)}`);
          console.log(`   Duration: ${det.duration}ms`);
          
          if (userResult.posting) {
            console.log(`   Leads posted: ${userResult.posting.stats.posted}`);
            console.log(`   Posting failed: ${userResult.posting.stats.failed}`);
          }
          
          if (det.leadsDetected > 0) {
            console.log('\n   Detected leads:');
            det.leads.forEach((lead, i) => {
              console.log(`   ${i + 1}. Confidence: ${lead.analysis.confidence_score}%`);
              console.log(`      From: ${lead.message.first_name} ${lead.message.last_name}`);
              console.log(`      Channel: ${lead.message.chat_name}`);
            });
          }
        } else {
          console.log(`   ❌ Failed: ${userResult.error}`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('TEST SCAN COMPLETE');
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test scan failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testScan();

