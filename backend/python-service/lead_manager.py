"""Lead Manager - Orchestrates the lead outreach workflow"""
import asyncio
import aiohttp
import os
from typing import Dict, List
from datetime import datetime
from config import TELEGRAM_BOT_TOKEN


class LeadManager:
    """Manages the complete lead outreach workflow"""
    
    def __init__(self, supabase, safety_manager, ai_communicator, telethon_manager):
        self.supabase = supabase
        self.safety = safety_manager
        self.ai = ai_communicator
        self.telethon = telethon_manager
        self.active_conversations = {}  # {conversation_id: data}
        self.pending_response_tasks = {}  # {conversation_id: asyncio.Task}
    
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
        
        # Check if confidence filter is enabled for this campaign
        filter_by_confidence = campaign.get('filter_by_confidence', False)
        max_confidence_for_ai = campaign.get('max_confidence_for_ai', 90) if filter_by_confidence else None
        
        if filter_by_confidence:
            print(f"   🎯 Confidence filter enabled: AI contacts leads < {max_confidence_for_ai}%")
            print(f"   👔 Leads ≥ {max_confidence_for_ai}% left for manual handling")
        
        # Get uncontacted leads for this user (with optional confidence filter)
        leads = await self.supabase.get_uncontacted_leads(user_id, max_confidence=max_confidence_for_ai)
        
        if not leads:
            print(f"   ℹ️ No uncontacted leads for this campaign" + 
                  (f" (with confidence < {max_confidence_for_ai}%)" if filter_by_confidence else ""))
            return
        
        print(f"   📊 Found {len(leads)} uncontacted leads" +
              (f" (confidence < {max_confidence_for_ai}%)" if filter_by_confidence else ""))
        
        # Process each lead
        contacted_count = 0
        for i, lead in enumerate(leads, 1):
            print(f"\n   💼 Processing lead {i}/{len(leads)}")
            
            # Check if campaign is still running (user might have paused it)
            current_status = await self.supabase.get_campaign_status(campaign_id)
            if current_status != 'running':
                print(f"   ⏸️ Campaign status changed to '{current_status}' - stopping processing")
                break
            
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
                lead,
                user_id  # Pass user_id
            )
            
            if success:
                contacted_count += 1
                
                # Update campaign stats
                await self.supabase.update_campaign_stats(
                    campaign_id, 
                    leads_contacted=1
                )
                
                # Wait before next lead ONLY IF successful (anti-spam delay)
                if i < len(leads):  # Don't wait after last lead
                    delay = await self.safety.get_message_delay()
                    print(f"   ⏱️ Waiting {delay:.1f}s before next message")
                    await asyncio.sleep(delay)
            else:
                # If skipped or failed, don't wait full delay
                print(f"   ⏭️ Skipped/Failed, moving to next lead immediately")
                await asyncio.sleep(1)
        
        print(f"\n   ✅ Campaign complete: contacted {contacted_count}/{len(leads)} leads")
    
    async def _process_single_lead(
        self, 
        campaign_id: str,
        campaign: Dict,
        account: Dict, 
        lead: Dict,
        user_id: str
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
            print(f"      ⚠️ Lead {lead_id} has no username, marking as processed and skipping")
            await self.supabase.mark_lead_contacted(lead_id)
            return False
        
        # Remove @ if present
        username = username.lstrip('@')
        
        print(f"      👤 Lead: @{username}")
        print(f"      📝 Original message: {lead['message'][:100]}...")
        print(f"      🎯 Confidence: {lead['confidence_score']}%")
        
        try:
            # 1. Ensure connection first
            if not await self.telethon.ensure_connected(account_id):
                print(f"      ❌ Account disconnected and failed to reconnect - skipping lead")
                return False

            # 2. Get Telegram user ID
            user_info = await self.telethon.get_user_info(account_id, username)
            
            # If user_info is None, it means an error occurred (e.g. connection error)
            # We must STOP here to avoid wasting AI credits
            if user_info is None:
                print(f"      ❌ Failed to get user info (likely invalid username or connection error) - skipping AI generation")
                return False

            # Skip if it's a channel or group
            if user_info is False:
                print(f"      ⏭️ Skipping - @{username} is a channel/group, not a user")
                await self.supabase.mark_lead_contacted(lead_id)
                return True  # Not an error, just skip
            
            telegram_user_id = user_info['id']
            
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
            
            # Send message via Telethon (with proxy verification)
            send_result = await self.telethon.send_message(
                account_id,
                username,
                first_message,
                account=account  # Pass account for proxy verification
            )
            
            # Handle different send results
            if send_result == "privacy_premium":
                # User requires Telegram Premium - skip this lead permanently
                print(f"      ⏭️ Skipping - user requires Telegram Premium")
                await self.supabase.skip_lead_with_reason(lead_id, "privacy_premium_required")
                return False
            
            if send_result == "forbidden":
                # Can't write to this user - skip permanently
                print(f"      ⏭️ Skipping - cannot write to user (forbidden)")
                await self.supabase.skip_lead_with_reason(lead_id, "write_forbidden")
                return False
            
            if send_result != "success":
                print(f"      ❌ Failed to send message: {send_result}")
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
                telegram_user_id,
                lead_id,
                user_id  # Pass user_id
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
        peer_user_id: int,
        lead_id: int = 0,
        user_id: str = None
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
                # Check if sender is a bot
                sender = await event.get_sender()
                if sender.bot:
                    print(f"   🤖 Detected bot (@{sender.username}) - stopping conversation")
                    await self.supabase.update_conversation_status(conversation_id, 'stopped')
                    return
                
                # Check if username contains 'bot'
                if sender.username and 'bot' in sender.username.lower():
                    print(f"   🤖 Username contains 'bot' (@{sender.username}) - stopping conversation")
                    await self.supabase.update_conversation_status(conversation_id, 'stopped')
                    return
                
                new_message = event.message.text
                
                # 🛡️ AUTO-BOT DETECTION (Immediate checks)
                
                # Check 1: Message mentions other bots (@...bot, @..._bot)
                import re
                bot_mentions = re.findall(r'@\w*[_]?bot\b', new_message.lower())
                if bot_mentions:
                    print(f"   🤖 Message mentions bots {bot_mentions} - likely auto-responder, stopping")
                    await self.supabase.update_conversation_status(conversation_id, 'stopped')
                    return
                
                # Check 3: Detect spam/ad keywords
                spam_keywords = [
                    'воспользуйтесь ботом',
                    'оцените бесплатно',
                    'попробуйте бесплатно',
                    'наш бот',
                    'наш сервис',
                    'зарегистрируйтесь',
                    'забудьте о',
                    'автоматически',
                    'телеграм-бот',
                    'телеграм бот'
                ]
                message_lower = new_message.lower()
                if any(keyword in message_lower for keyword in spam_keywords):
                    print(f"   🤖 Message contains spam keywords - likely auto-responder, stopping")
                    await self.supabase.update_conversation_status(conversation_id, 'stopped')
                    return

                # Add new message to history
                await self.supabase.add_message_to_conversation(
                    conversation_id,
                    'user',
                    new_message
                )
                
                # Cancel any existing pending response task (Debouncing)
                if conversation_id in self.pending_response_tasks:
                    print(f"   🔄 Cancelling pending response for {conversation_id} (user sent another message)")
                    self.pending_response_tasks[conversation_id].cancel()
                    try:
                        await self.pending_response_tasks[conversation_id]
                    except asyncio.CancelledError:
                        pass
                
                # Schedule new response task with delay
                task = asyncio.create_task(self._process_delayed_response(
                    account_id, conversation_id, campaign_id, campaign, peer_user_id, lead_id, user_id, event
                ))
                self.pending_response_tasks[conversation_id] = task
                
            except Exception as e:
                print(f"   ❌ Error handling message: {e}")
        
        # Register handler
        self.telethon.register_message_callback(account_id, message_handler)

    async def _process_delayed_response(
        self,
        account_id: str,
        conversation_id: str,
        campaign_id: str,
        campaign: Dict,
        peer_user_id: int,
        lead_id: int,
        user_id: str,
        last_event
    ):
        """
        Process response generation after a delay (to batch user messages)
        """
        try:
            # Wait 60 seconds to allow user to finish typing multiple messages
            print(f"   ⏳ Waiting 60s for more messages from user...")
            await asyncio.sleep(60)
            
            print(f"   🤖 Generating response for conversation {conversation_id}")
            
            # Get updated history (includes all recent user messages)
            history = await self.supabase.get_conversation_history(conversation_id)
            
            # Check length limit
            if len(history) >= 12: # 6 exchanges
                 print(f"   ⚠️ Conversation reached limit without becoming hot lead - stopping")
                 await self.supabase.update_conversation_status(conversation_id, 'stopped')
                 return

            # Check repeated messages (spam check on history)
            user_messages = [msg['content'] for msg in history if msg['role'] == 'user']
            if len(user_messages) >= 3:
                 if user_messages[-1] == user_messages[-2]:
                      print(f"   🤖 Detected identical repeated messages - likely bot, stopping")
                      await self.supabase.update_conversation_status(conversation_id, 'stopped')
                      return

            # Prepare data for AI
            if not history:
                return
                
            last_message_content = history[-1]['content']
            history_for_ai = history[:-1] # All except last
            
            # Generate AI response
            response, is_hot_lead = await self.ai.generate_response(
                history_for_ai,
                last_message_content
            )
            
            print(f"   🤖 Generated response: {response[:100]}...")
            
            # Check if hot lead - STOP IMMEDIATELY if true
            if is_hot_lead:
                print(f"   🔥 Hot lead detected! Stopping conversation immediately (no response sent).")
                
                # We don't send response, but we update history for the report
                # The user message is already in history. We won't add assistant response.
                
                await self._handle_hot_lead(
                    campaign_id,
                    campaign,
                    conversation_id,
                    peer_user_id,
                    history, # Pass current history without assistant response
                    account_id,
                    lead_id,
                    user_id
                )
                return

            # Human-like delay (additional small random delay)
            import random
            delay = random.uniform(5, 15)
            await asyncio.sleep(delay)
            
            # Send response
            await last_event.respond(response)
            
            # Save our response
            await self.supabase.add_message_to_conversation(
                conversation_id,
                'assistant',
                response
            )
            
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"   ❌ Error in delayed response processing: {e}")
        finally:
            if conversation_id in self.pending_response_tasks:
                del self.pending_response_tasks[conversation_id]
    
    async def _handle_hot_lead(
        self, 
        campaign_id: str,
        campaign: Dict,
        conversation_id: str,
        peer_user_id: int,
        full_history: List[Dict],
        account_id: str,
        lead_id: int,
        user_id: str
    ):
        """
        Handle hot lead detection
        - Check if hot_lead already exists (continuing conversation)
        - If new: mark as hot_lead, create record, post "NEW HOT LEAD"
        - If existing: update history, post "NEW MESSAGE FROM HOT LEAD"
        """
        # Check if this conversation already has a hot_lead record
        existing_hot_lead = await self.supabase.get_existing_hot_lead(conversation_id)
        
        # Get detailed lead info
        lead_details = await self.supabase.get_lead_details(lead_id)
        if not lead_details:
             print(f"   ⚠️ Could not fetch lead details for lead_id {lead_id}, using minimal info")
             pass
        
        # Construct contact info
        username = 'unknown'
        if lead_details and lead_details.get('original_message'):
             username = lead_details['original_message'].get('username') or 'unknown'
        
        contact_info = {
            'telegram_user_id': peer_user_id,
            'username': username,
            'lead_details': lead_details
        }
        
        target_channel = campaign.get('target_channel_id')
        
        if existing_hot_lead:
            # This is a CONTINUING conversation with an existing hot lead
            print(f"\n📬 NEW MESSAGE FROM EXISTING HOT LEAD in conversation {conversation_id}")
            
            hot_lead_id = existing_hot_lead['id']
            old_history = existing_hot_lead.get('conversation_history', [])
            
            # Update hot_lead record with new conversation history
            await self.supabase.update_hot_lead_history(hot_lead_id, full_history)
            
            # Post "NEW MESSAGE" notification instead of "NEW HOT LEAD"
            if target_channel:
                await self._post_hot_lead_update_to_channel(
                    hot_lead_id,
                    target_channel,
                    contact_info,
                    old_history,
                    full_history,
                    lead_details,
                    user_id
                )
            
            print(f"   ✅ Hot lead updated with new message: {hot_lead_id}")
        else:
            # This is a NEW hot lead
            print(f"\n🔥 NEW HOT LEAD DETECTED in conversation {conversation_id}")
            
            # Update conversation status
            await self.supabase.update_conversation_status(conversation_id, 'hot_lead')
            
            hot_lead_id = await self.supabase.create_hot_lead(
                campaign_id=campaign_id,
                conversation_id=conversation_id,
                lead_id=lead_id,
                conversation_history=full_history,
                contact_info=contact_info
            )
            
            # Update campaign stats (only for NEW hot leads)
            await self.supabase.update_campaign_stats(campaign_id, hot_leads_found=1)
            
            # Post to Telegram channel if configured
            if target_channel:
                await self._post_hot_lead_to_channel(
                    hot_lead_id,
                    target_channel,
                    contact_info,
                    full_history,
                    lead_details,
                    user_id
                )
            
            print(f"   ✅ Hot lead saved: {hot_lead_id}")
    
    def _escape_markdown(self, text: str) -> str:
        """
        Escape special Markdown characters to prevent parsing errors
        """
        if not text:
            return text
        
        # Characters that need escaping in Telegram Markdown
        special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
        
        escaped = text
        for char in special_chars:
            escaped = escaped.replace(char, f'\\{char}')
        
        return escaped
    
    async def _post_hot_lead_to_channel(
        self,
        hot_lead_id: str,
        channel_id: str,
        contact_info: Dict,
        conversation_history: List[Dict],
        lead_details: Dict,
        user_id: str
    ):
        """
        Post NEW hot lead notification to Telegram channel using Bot API
        """
        try:
            print(f"   📢 Generating report for channel {channel_id}...")
            
            # 1. Get Bot Token from config
            bot_token = TELEGRAM_BOT_TOKEN
            
            if not bot_token:
                print(f"   ⚠️ No TELEGRAM_BOT_TOKEN in env vars - cannot post to channel")
                return

            # 2. Get Lead Info
            username = contact_info.get('username', 'Unknown')
            original_msg = lead_details.get('original_message', {}) if lead_details else {}
            chat_name = original_msg.get('chat_name', 'Unknown Chat')
            original_text = original_msg.get('message', 'N/A')
            
            # 3. Generate AI Context/Summary
            summary = await self.ai.generate_lead_summary(lead_details, conversation_history)
            
            # 4. Format Dialogue (escape special chars)
            dialogue_text = ""
            for msg in conversation_history:
                role = "🤖" if msg['role'] == 'assistant' else "👤"
                # Escape content to prevent Markdown parsing errors
                content = self._escape_markdown(msg['content'])
                dialogue_text += f"{role} {content}\n\n"
            
            # Escape other dynamic text fields
            chat_name_escaped = self._escape_markdown(chat_name)
            original_text_escaped = self._escape_markdown(original_text)
            summary_escaped = self._escape_markdown(summary)
            
            # 5. Construct Message (plain text - no Markdown to avoid parsing issues)
            message = f"""🔥 ГОРЯЧИЙ ЛИД НАЙДЕН!

👤 Инфо о лиде:
User: @{username}
ID: {contact_info.get('telegram_user_id', 'N/A')}
Чат-источник: {chat_name}

📝 Изначальный запрос:
"{original_text}"

🧠 Анализ (почему подходит):
{summary}

💬 Переписка:
{dialogue_text}

🔗 ID лида в системе: {hot_lead_id}
"""
            
            # 6. Send via Telegram Bot API (without parse_mode to avoid Markdown issues)
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            
            # Ensure chat_id starts with -100 if it's a channel (common mistake)
            # But don't break simple numeric IDs
            target_chat_id = channel_id
            
            payload = {
                'chat_id': target_chat_id,
                'text': message
                # No parse_mode - send as plain text to avoid parsing errors
            }
            
            print(f"   📤 Sending request to Telegram: chat_id={target_chat_id}, token=...{bot_token[-5:]}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        # Mark as posted
                        await self.supabase.mark_hot_lead_posted(hot_lead_id)
                        print(f"   ✅ Posted hot lead report to channel {target_chat_id} via Bot")
                    else:
                        err_text = await resp.text()
                        print(f"   ❌ Failed to send report via Bot: {resp.status} - {err_text}")
            
        except Exception as e:
            print(f"   ⚠️ Failed to post to channel: {e}")
    
    async def _post_hot_lead_update_to_channel(
        self,
        hot_lead_id: str,
        channel_id: str,
        contact_info: Dict,
        old_history: List[Dict],
        new_history: List[Dict],
        lead_details: Dict,
        user_id: str
    ):
        """
        Post notification about NEW MESSAGE from existing hot lead
        Highlights new messages since last notification
        """
        try:
            print(f"   📢 Generating UPDATE report for channel {channel_id}...")
            
            # 1. Get Bot Token from config
            bot_token = TELEGRAM_BOT_TOKEN
            
            if not bot_token:
                print(f"   ⚠️ No TELEGRAM_BOT_TOKEN in env vars - cannot post to channel")
                return

            # 2. Get Lead Info
            username = contact_info.get('username', 'Unknown')
            original_msg = lead_details.get('original_message', {}) if lead_details else {}
            chat_name = original_msg.get('chat_name', 'Unknown Chat')
            
            # 3. Find NEW messages (difference between old and new history)
            old_count = len(old_history) if old_history else 0
            new_messages = new_history[old_count:] if new_history else []
            
            # 4. Format full dialogue with NEW messages highlighted
            dialogue_text = ""
            for i, msg in enumerate(new_history):
                role = "🤖" if msg['role'] == 'assistant' else "👤"
                content = self._escape_markdown(msg['content'])
                
                # Highlight NEW messages with ⚡ marker
                if i >= old_count:
                    dialogue_text += f"⚡ {role} {content} ⬅️ НОВОЕ\n\n"
                else:
                    dialogue_text += f"{role} {content}\n\n"
            
            # 5. Format NEW messages separately for quick view
            new_messages_text = ""
            for msg in new_messages:
                role = "🤖 Вы" if msg['role'] == 'assistant' else "👤 Лид"
                content = self._escape_markdown(msg['content'])
                new_messages_text += f"{role}: {content}\n\n"
            
            if not new_messages_text:
                new_messages_text = "(нет новых сообщений)"
            
            # 6. Construct Message
            message = f"""📬 НОВОЕ СООБЩЕНИЕ ОТ ГОРЯЧЕГО ЛИДА!

👤 Лид: @{username}
ID: {contact_info.get('telegram_user_id', 'N/A')}
Чат-источник: {chat_name}

🆕 Новые сообщения ({len(new_messages)} шт.):
{new_messages_text}
━━━━━━━━━━━━━━━━━━━━━━

💬 Полная переписка:
{dialogue_text}

🔗 ID лида в системе: {hot_lead_id}
"""
            
            # 7. Send via Telegram Bot API
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            target_chat_id = channel_id
            
            payload = {
                'chat_id': target_chat_id,
                'text': message
            }
            
            print(f"   📤 Sending UPDATE to Telegram: chat_id={target_chat_id}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        print(f"   ✅ Posted hot lead UPDATE to channel {target_chat_id}")
                    else:
                        err_text = await resp.text()
                        print(f"   ❌ Failed to send UPDATE via Bot: {resp.status} - {err_text}")
            
        except Exception as e:
            print(f"   ⚠️ Failed to post update to channel: {e}")
