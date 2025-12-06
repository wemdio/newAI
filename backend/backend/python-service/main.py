"""
AI Messaging Service - Main Entry Point

Automatically contacts detected leads using Telegram accounts and AI conversation.
"""
import asyncio
import sys
from datetime import datetime
from typing import List

# Import our modules
from config import LOG_LEVEL, SUPABASE_URL, SUPABASE_KEY
from supabase_client_rest import SupabaseClient
from safety_manager import SafetyManager
from ai_communicator import AICommunicator
from telethon_client import TelethonManager
from lead_manager import LeadManager
from manual_messaging import ManualMessagingManager


class AIMessagingService:
    """Main service orchestrator"""
    
    def __init__(self):
        self.supabase = None
        self.safety = None
        self.telethon = None
        self.manual_messenger = None
        self.running = False
    
    async def start(self):
        """Start the service"""
        print("=" * 60)
        print("🤖 AI Messaging Service")
        print("=" * 60)
        print(f"Started at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
        print()
        
        try:
            # Initialize components
            print("🔧 Initializing components...")
            
            # Connect to Supabase (REST API)
            self.supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
            await self.supabase.connect()
            
            # Initialize managers
            self.safety = SafetyManager(self.supabase)
            self.telethon = TelethonManager(self.supabase, self.safety)
            self.manual_messenger = ManualMessagingManager(self.supabase, self.telethon)
            
            print("✅ All components initialized")
            print()
            
            # Check and reset daily counters if needed
            await self.safety.check_and_reset_daily_counters()
            
            # Start main loop
            self.running = True
            await self.main_loop()
            
        except KeyboardInterrupt:
            print("\n⚠️ Received interrupt signal")
            await self.shutdown()
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            import traceback
            traceback.print_exc()
            await self.shutdown()
            sys.exit(1)
    
    async def main_loop(self):
        """Main processing loop"""
        iteration = 0
        
        while self.running:
            iteration += 1
            print(f"\n{'='*60}")
            print(f"🔄 Iteration #{iteration} - {datetime.utcnow().strftime('%H:%M:%S')} UTC")
            print(f"{'='*60}\n")
            
            try:
                # 1. Process manual message queue (High Priority)
                await self.manual_messenger.process_queue()
                
                # 2. Get active campaigns
                campaigns = await self.supabase.get_active_campaigns()
                
                if not campaigns:
                    print("ℹ️ No active campaigns")
                else:
                    print(f"📋 Found {len(campaigns)} active campaign(s)")
                    
                    # Process each campaign
                    for campaign in campaigns:
                        await self.process_campaign(campaign)
                
                # Check if need to reset daily counters
                await self.safety.check_and_reset_daily_counters()
                
            except Exception as e:
                print(f"❌ Error in main loop: {e}")
                import traceback
                traceback.print_exc()
            
            # Wait before next iteration (60 seconds)
            print(f"\n⏸️ Sleeping for 60 seconds...")
            await asyncio.sleep(60)
    
    async def process_campaign(self, campaign: dict):
        """Process a single campaign"""
        try:
            user_id = str(campaign['user_id'])
            
            # Get user's OpenRouter API key from database
            user_config = await self.supabase.get_user_config(user_id)
            
            if not user_config or not user_config.get('openrouter_api_key'):
                print(f"⚠️ Campaign {campaign['id']}: User {user_id} has no OpenRouter API key configured")
                print(f"   💡 User must add their API key in app settings")
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
            print(f"❌ Error processing campaign {campaign['id']}: {e}")
            import traceback
            traceback.print_exc()
    
    async def shutdown(self):
        """Graceful shutdown"""
        print("\n🛑 Shutting down...")
        
        self.running = False
        
        # Close Telethon clients
        if self.telethon:
            await self.telethon.close_all()
        
        # Close database connection
        if self.supabase:
            await self.supabase.close()
        
        print("✅ Shutdown complete")


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

