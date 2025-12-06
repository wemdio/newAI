"""Manual Messaging Manager - Handles sending messages from the queue"""
import asyncio
import json
from datetime import datetime
from typing import Dict, List

class ManualMessagingManager:
    """Manages processing of the manual message queue"""
    
    def __init__(self, supabase, telethon_manager):
        self.supabase = supabase
        self.telethon = telethon_manager
        
    async def process_queue(self):
        """Check for pending messages and send them"""
        try:
            # Fetch pending messages from message_queue
            # Note: Using direct Supabase client method
            url = f"{self.supabase.url}/rest/v1/message_queue"
            url += "?select=*"
            url += "&status=eq.pending"
            url += "&order=created_at.asc"
            url += "&limit=10"
            
            async with self.supabase.session.get(url) as resp:
                if resp.status != 200:
                    print(f"⚠️ Failed to fetch message queue: {resp.status}")
                    return
                
                messages = await resp.json()
                
            if not messages:
                return
                
            print(f"📨 Found {len(messages)} manual messages to send")
            
            for msg in messages:
                await self._process_single_message(msg)
                
        except Exception as e:
            print(f"❌ Error processing message queue: {e}")
            
    async def _process_single_message(self, msg: Dict):
        """Process a single queued message"""
        msg_id = msg['id']
        account_id = msg['account_id']
        username = msg['peer_username']
        content = msg['content']
        conversation_id = msg['conversation_id']
        
        print(f"   📤 Sending manual message to @{username} (ID: {msg_id})")
        
        try:
            # Mark as processing
            await self.supabase._patch('message_queue', {'id': msg_id}, {
                'status': 'processing',
                'processed_at': datetime.utcnow().isoformat()
            })
            
            # Ensure account is initialized
            account_data = await self.supabase._get('telegram_accounts', {'id': account_id})
            if not account_data:
                raise Exception(f"Account {account_id} not found")
                
            account = account_data[0]
            
            # Init Telethon if needed
            if account_id not in self.telethon.clients:
                success = await self.telethon.init_account(account)
                if not success:
                    raise Exception("Failed to initialize Telegram account")
            
            # Send message
            success = await self.telethon.send_message(account_id, username, content)
            
            if success:
                print(f"      ✅ Message sent successfully")
                
                # Update queue status
                await self.supabase._patch('message_queue', {'id': msg_id}, {
                    'status': 'sent',
                    'processed_at': datetime.utcnow().isoformat()
                })
                
                # Add to conversation history in DB so it shows in UI
                # Note: Role is 'assistant' but maybe we want 'manual_user'? 
                # Using 'assistant' keeps it on the right side of the chat UI.
                # We can prefix with [Manager] if needed, but raw text is better.
                await self.supabase.add_message_to_conversation(
                    conversation_id,
                    'assistant',
                    content
                )
                
            else:
                raise Exception("Telethon send_message returned False")
                
        except Exception as e:
            print(f"      ❌ Failed to send manual message: {e}")
            
            # Update queue status to failed
            await self.supabase._patch('message_queue', {'id': msg_id}, {
                'status': 'failed',
                'error': str(e),
                'processed_at': datetime.utcnow().isoformat()
            })

