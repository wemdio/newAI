"""Lead Manager - Orchestrates the lead outreach workflow"""
import asyncio
from typing import Dict, List
from datetime import datetime


class LeadManager:
    """Manages the complete lead outreach workflow"""
    
    def __init__(self, supabase, safety_manager, ai_communicator, telethon_manager):
        self.supabase = supabase
        self.safety = safety_manager
        self.ai = ai_communicator
        self.telethon = telethon_manager
        self.active_conversations = {}  # {conversation_id: data}
    
    async def process_campaign(self, campaign: Dict):
        """
        Process one campaign - contact uncontacted leads
        
        Args:
            campaign: Campaign dict from database
        """
        campaign_id = str(campaign['id'])
        user_id = str(campaign['user_id'])
        campaign_name = campaign['name']
        
        print(f"\n🚀 Processing campaign: {campaign_name}")
        print(f"   Campaign ID: {campaign_id}")
        print(f"   User ID: {user_id}")
        
        # Get uncontacted leads for this user
        leads = await self.supabase.get_uncontacted_leads(user_id)
        
        if not leads:
            print(f"   ℹ️ No uncontacted leads for this campaign")
            return
        
        print(f"   📊 Found {len(leads)} uncontacted leads")
        
        # Process each lead
        contacted_count = 0
        for i, lead in enumerate(leads, 1):
            print(f"\n   💼 Processing lead {i}/{len(leads)}")
            
            # Get available account
            account = await self.safety.get_available_account(user_id)
            if not account:
                print(f"   ⚠️ No available accounts - pausing campaign")
                break
            
            # Initialize account if not already done
            account_id = str(account['id'])
            if account_id not in self.telethon.clients:
                success = await self.telethon.init_account(account)
                if not success:
                    continue
            
            # Process this lead
            success = await self._process_single_lead(
                campaign_id,
                campaign,
                account,
                lead
            )
            
            if success:
                contacted_count += 1
                
                # Update campaign stats
                await self.supabase.update_campaign_stats(
                    campaign_id, 
                    leads_contacted=1
                )
            
            # Wait before next lead (anti-spam delay)
            if i < len(leads):  # Don't wait after last lead
                delay = await self.safety.get_message_delay()
                await asyncio.sleep(delay)
        
        print(f"\n   ✅ Campaign complete: contacted {contacted_count}/{len(leads)} leads")
    
    async def _process_single_lead(
        self, 
        campaign_id: str,
        campaign: Dict,
        account: Dict, 
        lead: Dict
    ) -> bool:
        """
        Process a single lead - send first message
        
        Returns:
            True if successful, False otherwise
        """
        account_id = str(account['id'])
        lead_id = lead['lead_id']
        username = lead.get('username')
        
        if not username:
            print(f"      ⚠️ Lead {lead_id} has no username, skipping")
            return False
        
        # Remove @ if present
        username = username.lstrip('@')
        
        print(f"      👤 Lead: @{username}")
        print(f"      📝 Original message: {lead['message'][:100]}...")
        print(f"      🎯 Confidence: {lead['confidence_score']}%")
        
        try:
            # Get Telegram user ID first
            user_info = await self.telethon.get_user_info(account_id, username)
            telegram_user_id = user_info['id'] if user_info else 0
            
            # Check if we already have an active conversation with this user in this campaign
            existing_conversation = await self.supabase.check_existing_conversation(
                campaign_id=campaign_id,
                peer_user_id=telegram_user_id
            )
            
            if existing_conversation:
                print(f"      ⏭️ Skipping - already have active conversation with this user")
                # Still mark as contacted to avoid processing again
                await self.supabase.mark_lead_contacted(lead_id)
                return True  # Not an error, just skip
            
            # Generate first message using AI
            first_message = await self.ai.generate_first_message(lead)
            
            print(f"      💬 Generated message: {first_message[:100]}...")
            
            # Send message via Telethon
            success = await self.telethon.send_message(
                account_id,
                username,
                first_message
            )
            
            if not success:
                print(f"      ❌ Failed to send message")
                return False
            
            # Create conversation record
            conversation_id = await self.supabase.create_conversation(
                campaign_id=campaign_id,
                account_id=account_id,
                lead_id=lead_id,
                peer_user_id=telegram_user_id,
                peer_username=username,
                first_message=first_message
            )
            
            # Register message handler for this conversation
            self._register_conversation_handler(
                account_id,
                conversation_id,
                campaign_id,
                campaign,
                telegram_user_id
            )
            
            # Mark lead as contacted
            await self.supabase.mark_lead_contacted(lead_id)
            
            # Update account usage
            await self.safety.mark_account_used(account_id)
            
            print(f"      ✅ First message sent successfully")
            return True
            
        except Exception as e:
            print(f"      ❌ Error processing lead: {e}")
            return False
    
    def _register_conversation_handler(
        self, 
        account_id: str,
        conversation_id: str,
        campaign_id: str,
        campaign: Dict,
        peer_user_id: int
    ):
        """
        Register handler for incoming messages in this conversation
        """
        async def message_handler(event):
            # Check if message is from our target user
            if event.sender_id != peer_user_id:
                return
            
            print(f"\n📨 Received message in conversation {conversation_id}")
            
            try:
                # Get conversation history
                history = await self.supabase.get_conversation_history(conversation_id)
                
                # Add new message to history
                new_message = event.message.text
                await self.supabase.add_message_to_conversation(
                    conversation_id,
                    'user',
                    new_message
                )
                
                # Generate AI response
                response, is_hot_lead = await self.ai.generate_response(
                    history,
                    new_message
                )
                
                print(f"   🤖 Generated response: {response[:100]}...")
                
                # Send response
                await event.respond(response)
                
                # Save our response
                await self.supabase.add_message_to_conversation(
                    conversation_id,
                    'assistant',
                    response
                )
                
                # Check if hot lead
                if is_hot_lead:
                    await self._handle_hot_lead(
                        campaign_id,
                        campaign,
                        conversation_id,
                        event.sender_id,
                        history + [
                            {'role': 'user', 'content': new_message},
                            {'role': 'assistant', 'content': response}
                        ]
                    )
                
            except Exception as e:
                print(f"   ❌ Error handling message: {e}")
        
        # Register handler
        self.telethon.register_message_callback(account_id, message_handler)
    
    async def _handle_hot_lead(
        self, 
        campaign_id: str,
        campaign: Dict,
        conversation_id: str,
        peer_user_id: int,
        full_history: List[Dict]
    ):
        """
        Handle hot lead detection
        - Mark conversation as hot_lead
        - Create hot_lead record
        - Post to Telegram channel
        """
        print(f"\n🔥 HOT LEAD DETECTED in conversation {conversation_id}")
        
        # Update conversation status
        await self.supabase.update_conversation_status(conversation_id, 'hot_lead')
        
        # Get lead info
        conversation = await self.supabase.get_conversation_history(conversation_id)
        
        # Create hot lead record
        contact_info = {
            'telegram_user_id': peer_user_id,
            'username': conversation[0].get('peer_username', 'unknown')
        }
        
        hot_lead_id = await self.supabase.create_hot_lead(
            campaign_id=campaign_id,
            conversation_id=conversation_id,
            lead_id=0,  # Will be populated from conversation
            conversation_history=full_history,
            contact_info=contact_info
        )
        
        # Update campaign stats
        await self.supabase.update_campaign_stats(campaign_id, hot_leads_found=1)
        
        # Post to Telegram channel if configured
        target_channel = campaign.get('target_channel_id')
        if target_channel:
            await self._post_hot_lead_to_channel(
                hot_lead_id,
                target_channel,
                contact_info,
                full_history
            )
        
        print(f"   ✅ Hot lead saved: {hot_lead_id}")
    
    async def _post_hot_lead_to_channel(
        self,
        hot_lead_id: str,
        channel_id: str,
        contact_info: Dict,
        conversation_history: List[Dict]
    ):
        """
        Post hot lead notification to Telegram channel
        """
        try:
            # Format message
            username = contact_info.get('username', 'Unknown')
            message = f"""
🔥 **ГОРЯЧИЙ ЛИД**

👤 Контакт: @{username}
⏰ Дата: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC

📝 **История диалога:**
"""
            
            # Add conversation (last 5 messages)
            for msg in conversation_history[-5:]:
                role = "🤖" if msg['role'] == 'assistant' else "👤"
                content = msg['content'][:200]
                message += f"\n{role} {content}\n"
            
            message += f"\n💼 ID лида: `{hot_lead_id}`"
            
            # Send to channel (use first available account)
            # TODO: Implement channel posting
            print(f"   📢 Would post to channel {channel_id}")
            
            # Mark as posted
            await self.supabase.mark_hot_lead_posted(hot_lead_id)
            
        except Exception as e:
            print(f"   ⚠️ Failed to post to channel: {e}")



