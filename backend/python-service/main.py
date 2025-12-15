"""
AI Messaging Service - Main Entry Point

Automatically contacts detected leads using Telegram accounts and AI conversation.
"""
import asyncio
import sys
from datetime import datetime
from typing import List
import logging

# Import our modules
from config import LOG_LEVEL, SUPABASE_URL, SUPABASE_KEY, setup_logger
from supabase_client_rest import SupabaseClient
from safety_manager import SafetyManager
from ai_communicator import AICommunicator
from telethon_client import TelethonManager
from lead_manager import LeadManager

logger = setup_logger('LeadScanner')


class AIMessagingService:
    """Main service orchestrator"""
    
    def __init__(self):
        self.supabase = None
        self.safety = None
        self.telethon = None
        self.running = False
        self.active_campaign_tasks = {}  # {campaign_id: asyncio.Task}
    
    async def start(self):
        """Start the service"""
        logger.info("=" * 60)
        logger.info("🤖 AI Messaging Service")
        logger.info("=" * 60)
        
        try:
            # Initialize components
            logger.info("🔧 Initializing components...")
            
            # Connect to Supabase (REST API)
            self.supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
            await self.supabase.connect()
            
            # Initialize managers
            self.safety = SafetyManager(self.supabase)
            self.telethon = TelethonManager(self.supabase, self.safety)
            
            logger.info("✅ All components initialized")
            
            # Check and reset daily counters if needed
            await self.safety.check_and_reset_daily_counters()
            
            # Start main loop
            self.running = True
            await self.main_loop()
            
        except KeyboardInterrupt:
            logger.warning("⚠️ Received interrupt signal")
            await self.shutdown()
        except Exception as e:
            logger.critical(f"❌ Fatal error: {e}", exc_info=True)
            await self.shutdown()
            sys.exit(1)
    
    async def main_loop(self):
        """Main processing loop"""
        iteration = 0
        
        while self.running:
            iteration += 1
            logger.info(f"🔄 Iteration #{iteration}")
            
            # Clean up finished tasks
            finished_campaigns = []
            for campaign_id, task in self.active_campaign_tasks.items():
                if task.done():
                    finished_campaigns.append(campaign_id)
                    # Check for exceptions
                    try:
                        exc = task.exception()
                        if exc:
                            logger.error(f"❌ Campaign {campaign_id} task failed: {exc}")
                    except Exception as e:
                        logger.error(f"⚠️ Error checking task status: {e}")
            
            for campaign_id in finished_campaigns:
                del self.active_campaign_tasks[campaign_id]
                
            if self.active_campaign_tasks:
                logger.info(f"ℹ️ Currently running campaigns: {len(self.active_campaign_tasks)}")
            
            try:
                # Process pending manual messages from queue
                await self.process_message_queue()
                
                # Check for accounts needing reconnection (e.g., proxy changed)
                await self.check_and_reconnect_accounts()
                
                # Get active campaigns
                campaigns = await self.supabase.get_active_campaigns()
                
                if not campaigns:
                    logger.info("ℹ️ No active campaigns")
                else:
                    logger.info(f"📋 Found {len(campaigns)} active campaign(s)")
                    
                    # Process each campaign
                    for campaign in campaigns:
                        campaign_id = str(campaign['id'])
                        
                        # Check if already running
                        if campaign_id in self.active_campaign_tasks:
                            logger.debug(f"🔄 Campaign {campaign['name']} is already running - skipping duplicate start")
                            continue
                            
                        # Start background task for this campaign
                        logger.info(f"🚀 Starting background task for: {campaign['name']}")
                        task = asyncio.create_task(self.process_campaign(campaign))
                        self.active_campaign_tasks[campaign_id] = task
                
                # Check if need to reset daily counters
                # NOTE: Ideally this should be moved to pg_cron or separate worker as discussed
                await self.safety.check_and_reset_daily_counters()

                # Check and recover stuck accounts (auto-healing)
                await self.safety.check_and_recover_accounts()
                
            except Exception as e:
                logger.error(f"❌ Error in main loop: {e}", exc_info=True)
            
            # Wait before next iteration (60 seconds)
            # The campaigns run in background during this sleep!
            logger.debug(f"⏸️ Main loop sleeping for 60 seconds...")
            await asyncio.sleep(60)
    
    async def process_message_queue(self):
        """Process pending manual messages from the queue"""
        try:
            # Get pending messages
            messages = await self.supabase.get_pending_messages()
            
            if not messages:
                return  # Nothing to process
            
            logger.info(f"📬 Processing {len(messages)} pending manual message(s)")
            
            for msg in messages:
                msg_id = msg['id']
                conversation_id = msg.get('conversation_id')
                account_id = msg['account_id']
                peer_username = msg['peer_username']
                content = msg['content']
                
                logger.info(f"   📤 Sending to @{peer_username}: {content[:50]}...")
                
                try:
                    # Mark as processing to prevent duplicates if worker restarts mid-loop
                    await self.supabase.update_message_queue_status(msg_id, 'processing')

                    # Get account info
                    account = await self.supabase.get_account_by_id(account_id)
                    
                    if not account:
                        logger.error(f"   ❌ Account {account_id} not found")
                        await self.supabase.update_message_queue_status(msg_id, 'failed', 'Account not found')
                        continue
                    
                    # Initialize account if not already done
                    if account_id not in self.telethon.clients:
                        success = await self.telethon.init_account(account)
                        if not success:
                            await self.supabase.update_message_queue_status(msg_id, 'failed', 'Failed to init account')
                            continue
                    
                    # Send message
                    result = await self.telethon.send_message(account_id, peer_username, content)
                    
                    if result == "success":
                        await self.supabase.update_message_queue_status(msg_id, 'sent')
                        logger.info(f"   ✅ Message sent to @{peer_username}")

                        # Persist message to conversation history so UI shows it after reload
                        if conversation_id:
                            ok = await self.supabase.add_message_to_conversation(
                                str(conversation_id),
                                'assistant',
                                content
                            )
                            if not ok:
                                logger.warning(
                                    f"   ⚠️ Message {msg_id} sent but failed to append to conversation_history "
                                    f"(conversation_id={conversation_id})"
                                )
                                # Keep status as sent to avoid re-sending, but store error for visibility
                                await self.supabase.update_message_queue_status(
                                    msg_id,
                                    'sent',
                                    'Sent, but failed to append to conversation_history'
                                )
                        else:
                            logger.warning(f"   ⚠️ Message {msg_id} has no conversation_id - cannot append to history")
                    else:
                        await self.supabase.update_message_queue_status(msg_id, 'failed', f'Send failed: {result}')
                        logger.error(f"   ❌ Failed to send: {result}")
                        
                except Exception as e:
                    logger.error(f"   ❌ Error sending message {msg_id}: {e}")
                    await self.supabase.update_message_queue_status(msg_id, 'failed', str(e))
                    
        except Exception as e:
            logger.error(f"⚠️ Error processing message queue: {e}")
    
    async def check_and_reconnect_accounts(self):
        """Check for accounts that need reconnection and reconnect them"""
        try:
            accounts = await self.supabase.get_accounts_needing_reconnect()
            
            if not accounts:
                return  # Nothing to reconnect
            
            logger.info(f"🔄 Found {len(accounts)} account(s) needing reconnection")
            
            for account in accounts:
                account_id = str(account['id'])
                account_name = account.get('account_name', f'Account {account_id}')
                
                logger.info(f"🔄 Reconnecting {account_name} (new proxy: {account.get('proxy_url', 'none')})")
                
                # Reconnect the account
                success = await self.telethon.reconnect_account(account_id, account)
                
                if success:
                    # Clear the reconnect flag
                    await self.supabase.clear_reconnect_flag(account_id)
                    logger.info(f"   ✅ {account_name} reconnected successfully")
                else:
                    logger.error(f"   ❌ Failed to reconnect {account_name}")
                    # Keep the flag so we retry next iteration
                
        except Exception as e:
            logger.error(f"⚠️ Error checking accounts for reconnection: {e}")
    
    async def process_campaign(self, campaign: dict):
        """Process a single campaign"""
        try:
            user_id = str(campaign['user_id'])
            
            # Get user's OpenRouter API key from database
            user_config = await self.supabase.get_user_config(user_id)
            
            if not user_config or not user_config.get('openrouter_api_key'):
                logger.warning(f"⚠️ Campaign {campaign['id']}: User {user_id} has no OpenRouter API key configured")
                return
            
            openrouter_api_key = user_config['openrouter_api_key']
            
            # Create AI communicator for this campaign (with user's API key)
            ai = AICommunicator(
                communication_prompt=campaign['communication_prompt'],
                hot_lead_criteria=campaign['hot_lead_criteria'],
                openrouter_api_key=openrouter_api_key
            )
            
            # Create lead manager
            lead_mgr = LeadManager(
                supabase=self.supabase,
                safety_manager=self.safety,
                ai_communicator=ai,
                telethon_manager=self.telethon
            )
            
            # Process campaign
            await lead_mgr.process_campaign(campaign)
            
        except Exception as e:
            logger.error(f"❌ Error processing campaign {campaign['id']}: {e}", exc_info=True)
    
    async def shutdown(self):
        """Graceful shutdown"""
        logger.info("🛑 Shutting down...")
        
        self.running = False
        
        # Cancel active campaign tasks
        if hasattr(self, 'active_campaign_tasks') and self.active_campaign_tasks:
            logger.info(f"⏳ Cancelling {len(self.active_campaign_tasks)} active campaign tasks...")
            for task in self.active_campaign_tasks.values():
                task.cancel()
            
            # Wait for tasks to cancel
            try:
                await asyncio.wait(self.active_campaign_tasks.values(), timeout=5)
            except Exception as e:
                logger.error(f"⚠️ Error waiting for tasks to cancel: {e}")
        
        # Close Telethon clients
        if self.telethon:
            await self.telethon.close_all()
        
        # Close database connection
        if self.supabase:
            await self.supabase.close()
        
        logger.info("✅ Shutdown complete")


def main():
    """Entry point"""
    # Check Python version
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ required")
        sys.exit(1)
    
    # Create and run service
    service = AIMessagingService()
    
    try:
        asyncio.run(service.start())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

