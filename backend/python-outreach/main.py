import asyncio
import random
import datetime
import pytz
import base64
import os
import string
import sys
import traceback
import python_socks
import sqlite3
import struct
from urllib.parse import urlparse
from telethon import TelegramClient
from telethon.sessions import StringSession, MemorySession
from telethon.crypto import AuthKey
from loguru import logger
from database import db
from account_manager import AccountManager
from ai_handler import AIHandler

# Configure Logging with [OutreachWorker] prefix
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>[OutreachWorker]</cyan> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
)

# Configuration
SLEEP_PERIODS = [
    (18, 9),   # 18:00 to 09:00 MSK (Sleep)
    (12, 15)   # 12:00 to 15:00 MSK (Sleep)
]
MSK_TZ = pytz.timezone('Europe/Moscow')

# Standard Telegram DC IPs (IPv4)
DC_IPV4 = {
    1: '149.154.175.50',
    2: '149.154.167.50',
    3: '149.154.175.100',
    4: '149.154.167.91',
    5: '91.108.56.130'
}

async def log_to_db(user_id, level, message):
    """Logs an event to the database for the user to see."""
    if not user_id:
        return
    try:
        # Truncate message if too long
        if len(message) > 1000:
            message = message[:1000] + "..."
            
        # Fire and forget-ish
        await asyncio.to_thread(
            db.get_client().table('outreach_logs').insert({
                'user_id': str(user_id),
                'level': level,
                'message': message
            }).execute
        )
    except Exception as e:
        # Don't let logging kill the worker, but print to stderr
        logger.warning(f"DB Log failed: {e}")

def parse_proxy(proxy_url):
    if not proxy_url:
        return None
    try:
        parsed = urlparse(proxy_url)
        if parsed.scheme not in ['socks5', 'http', 'https']:
            return None

        if parsed.scheme == 'socks5':
            p_type = python_socks.ProxyType.SOCKS5
        else:
            p_type = python_socks.ProxyType.HTTP
            
        # Use Dict format for python-socks
        return {
            'proxy_type': p_type,
            'addr': parsed.hostname,
            'port': parsed.port,
            'username': parsed.username,
            'password': parsed.password,
            'rdns': True 
        }
    except Exception as e:
        logger.error(f"Proxy parse error: {e}")
        return None

def extract_pyrogram_session(path):
    """
    Attempts to read a Pyrogram session file (sqlite) and extract auth key.
    Returns (dc_id, auth_key_bytes) or (None, None).
    """
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        # Pyrogram sessions table: (dc_id, api_id, test_mode, auth_key, date, user_id, is_bot)
        cursor.execute("SELECT dc_id, auth_key FROM sessions")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            dc_id, auth_key = row
            return dc_id, auth_key
    except Exception as e:
        logger.warning(f"Failed to read as Pyrogram session: {e}")
    return None, None

async def convert_session_file(session_blob_b64, api_id, api_hash, phone, proxy_url=None):
    rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    temp_name = f"temp_{phone}_{rand_suffix}"
    session_file_path = temp_name + '.session'
    
    proxy = parse_proxy(proxy_url)

    try:
        if not session_blob_b64:
            return None, "Empty session data"
            
        session_data = base64.b64decode(session_blob_b64)
        with open(session_file_path, 'wb') as f:
            f.write(session_data)
        
        client = None
        
        # 1. Try initializing as standard Telethon Session
        try:
            logger.info(f"Attempting to load Telethon session for {phone}...")
            # We must use a separate try-except for initialization vs connection
            # because init fails for Pyrogram sessions
            client = TelegramClient(temp_name, int(api_id), api_hash, proxy=proxy)
        except ValueError as e:
            # This catches "too many values to unpack" which implies Pyrogram/Other format
            logger.warning(f"Telethon init failed ({e}). Trying Pyrogram conversion...")
            
            dc_id, auth_key_bytes = extract_pyrogram_session(session_file_path)
            if dc_id and auth_key_bytes:
                logger.info(f"Detected Pyrogram session. DC: {dc_id}")
                
                # Create a MemorySession and populate it
                # We need to manually construct the session state
                session = StringSession() 
                session._dc_id = dc_id
                session._server_address = DC_IPV4.get(dc_id, '149.154.167.50') # Default fallback
                session._port = 443
                session._auth_key = AuthKey(data=auth_key_bytes)
                
                # Use this pre-filled session
                client = TelegramClient(session, int(api_id), api_hash, proxy=proxy)
            else:
                return None, f"Invalid session format and Pyrogram conversion failed: {e}"
        except Exception as e:
            return None, f"Client init error: {e}"

        # 2. Connect
        try:
            logger.info(f"Connecting with proxy: {proxy}")
            await client.connect()
        except Exception as e:
             logger.error(f"Client connect exception: {e}")
             logger.error(traceback.format_exc())
             return None, f"Connect error: {e}"
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return None, "Unauthorized session"
            
        string_session = StringSession.save(client.session)
        await client.disconnect()
        return string_session, None
        
    except Exception as e:
        logger.error(f"General conversion error: {e}")
        logger.error(traceback.format_exc())
        return None, str(e)
    finally:
        if os.path.exists(session_file_path):
            try:
                os.remove(session_file_path)
            except:
                pass
        if os.path.exists(temp_name + '.session-journal'):
            try:
                os.remove(temp_name + '.session-journal')
            except:
                pass

async def process_pending_conversions():
    """Finds accounts waiting for session conversion."""
    try:
        client = db.get_client()
        # Filter for status='pending_conversion'
        response = client.table('outreach_accounts')\
            .select('*')\
            .eq('status', 'pending_conversion')\
            .execute()
            
        accounts = response.data
        if not accounts:
            return

        logger.info(f"Found {len(accounts)} accounts pending conversion.")

        for acc in accounts:
            logger.info(f"Converting session for {acc.get('phone_number')}...")
            
            # Simple sanitization of phone for filename
            phone_safe = ''.join(filter(str.isdigit, str(acc.get('phone_number', 'unknown'))))
            
            session_str, error = await convert_session_file(
                acc.get('session_file_data'), 
                acc.get('api_id'), 
                acc.get('api_hash'), 
                phone_safe,
                acc.get('proxy_url')
            )

            if session_str:
                client.table('outreach_accounts').update({
                    'status': 'active', 
                    'import_status': 'completed',
                    'session_string': session_str,
                    'session_file_data': None # Clear blob to save space
                }).eq('id', acc['id']).execute()
                
                msg = f"Successfully converted session for {acc.get('phone_number')}"
                logger.info(msg)
                await log_to_db(acc.get('user_id'), 'INFO', msg)
            else:
                msg = f"Failed to convert {acc.get('phone_number')}: {error}"
                logger.error(msg)
                await log_to_db(acc.get('user_id'), 'ERROR', msg)
                
                client.table('outreach_accounts').update({
                    'status': 'failed', 
                    'import_status': f"failed: {error}"
                }).eq('id', acc['id']).execute()

                
    except Exception as e:
        logger.error(f"Error in conversion task: {e}")

async def is_sleeping_time():
    now = datetime.datetime.now(MSK_TZ)
    hour = now.hour
    
    # Check sleep periods
    # (18, 9) means >= 18 OR < 9
    # (12, 15) means >= 12 AND < 15
    
    # 18:00 - 09:00
    if hour >= 18 or hour < 9:
        return True
    
    # 12:00 - 15:00
    if 12 <= hour < 15:
        return True
        
    return False

async def get_next_target(campaign_id):
    """Fetches the next pending target for a campaign."""
    client = db.get_client()
    
    # Transaction-like fetch: get one 'pending' and lock it/mark processing
    # Supabase/Postgres doesn't support 'FOR UPDATE SKIP LOCKED' easily via generic client without RPC,
    # so we'll do a simple fetch-then-update. Race conditions are possible but acceptable for this scale.
    
    response = client.table('outreach_targets')\
        .select('*')\
        .eq('campaign_id', campaign_id)\
        .eq('status', 'pending')\
        .limit(1)\
        .execute()
        
    if response.data:
        target = response.data[0]
        # Mark as processing
        client.table('outreach_targets')\
            .update({'status': 'processing'})\
            .eq('id', target['id'])\
            .execute()
        return target
    return None

async def process_incoming_messages(account, mgr):
    """Checks for new messages and handles auto-replies."""
    logger.info(f"Checking inbox for {account['phone_number']}...")
    try:
        unread_msgs = await mgr.get_unread_messages()
        if not unread_msgs:
            return

        client = db.get_client()
        user_id = account['user_id']
        ai = AIHandler(user_id)
        
        # Group messages by username to handle multiple messages from same user
        msgs_by_user = {}
        for msg in unread_msgs:
            uname = msg.get('username')
            if uname:
                if uname not in msgs_by_user:
                    msgs_by_user[uname] = []
                msgs_by_user[uname].append(msg)
        
        for username, user_msgs in msgs_by_user.items():
            # Sort oldest to newest for correct insertion order
            user_msgs.sort(key=lambda x: x['date'])
            
            # Get latest msg for name info
            latest_msg = user_msgs[-1]

            # Find or Create Chat
            # Try to find existing chat
            chat_resp = client.table('outreach_chats')\
                .select('*')\
                .eq('account_id', account['id'])\
                .eq('target_username', username)\
                .execute()
                
            chat = chat_resp.data[0] if chat_resp.data else None
            
            if not chat:
                # Create a new chat entry
                chat_data = {
                    'user_id': user_id,
                    'account_id': account['id'],
                    'target_username': username,
                    'target_name': latest_msg.get('name'),
                    'status': 'active',
                    'last_message_at': datetime.datetime.now().isoformat(),
                    'unread_count': len(user_msgs)
                }
                chat_insert = client.table('outreach_chats').insert(chat_data).select().execute()
                chat = chat_insert.data[0] if chat_insert.data else None
            else:
                 new_count = (chat.get('unread_count') or 0) + len(user_msgs)
                 client.table('outreach_chats').update({
                     'last_message_at': datetime.datetime.now().isoformat(),
                     'unread_count': new_count
                 }).eq('id', chat['id']).execute()

            if not chat:
                logger.error(f"Failed to get/create chat for {username}")
                continue

            # Save All Messages
            for msg in user_msgs:
                client.table('outreach_messages').insert({
                    'chat_id': chat['id'],
                    'sender': 'them',
                    'content': msg['content'],
                    'created_at': msg['date'].isoformat() if msg['date'] else datetime.datetime.now().isoformat(),
                    'is_read': False
                }).execute()
                
                log_msg = f"📩 New message from @{username}: {msg['content'][:50]}..."
                logger.info(log_msg)
                await log_to_db(user_id, 'INFO', log_msg)

            # Auto-Reply Logic (Run once per batch)
            # Check if auto-reply is enabled for this campaign
            campaign_id = chat.get('campaign_id')
            auto_reply = False
            
            if campaign_id:
                camp_resp = client.table('outreach_campaigns').select('auto_reply_enabled').eq('id', campaign_id).execute()
                if camp_resp.data and camp_resp.data[0].get('auto_reply_enabled'):
                    auto_reply = True

            if auto_reply:
                # Fetch history
                history_resp = client.table('outreach_messages')\
                    .select('*')\
                    .eq('chat_id', chat['id'])\
                    .order('created_at', desc=False)\
                    .execute()
                
                history = history_resp.data or []
                
                # Generate Response
                logger.info(f"Generating AI response for @{username}...")
                response_text = await ai.generate_response(history)
                
                if response_text:
                    # Send
                    await asyncio.sleep(random.uniform(5, 10)) # Thinking time
                    success, err = await mgr.send_message(username, response_text)
                    
                    if success:
                        # Save AI Message
                        client.table('outreach_messages').insert({
                            'chat_id': chat['id'],
                            'sender': 'me',
                            'content': response_text,
                            'created_at': datetime.datetime.now().isoformat()
                        }).execute()
                        
                        log_ai = f"🤖 AI replied to @{username}: {response_text[:50]}..."
                        logger.info(log_ai)
                        await log_to_db(user_id, 'SUCCESS', log_ai)
                    else:
                        logger.error(f"Failed to send AI response: {err}")
                else:
                    logger.warning("AI returned empty response")

    except Exception as e:
        logger.error(f"Error processing inbox: {e}")
        logger.error(traceback.format_exc())

async def process_account(account):
    """Processes a single account's outreach tasks."""
    account_id = account['id']
    mgr = AccountManager(account)
    
    # Connect once for both tasks
    if not await mgr.connect():
        logger.error(f"Failed to connect account {account['phone_number']}")
        return

    try:
        # 1. Process Incoming Messages
        await process_incoming_messages(account, mgr)
        
        # 2. Outreach (Send New Messages)
        client = db.get_client()
        
        # Get campaigns
        campaigns_resp = client.table('outreach_campaigns')\
            .select('*')\
            .eq('status', 'active')\
            .cs('account_ids', [account_id])\
            .execute()
            
        campaigns = campaigns_resp.data
        if campaigns:
            # Pick a campaign
            campaign = random.choice(campaigns)
            
            # Get Target
            target = await get_next_target(campaign['id'])
            if target:
                await asyncio.sleep(random.uniform(2, 5))
                
                contact_point = target.get('username') or target.get('phone')
                message_text = campaign['message_template']
                
                msg = f"Sending to {contact_point} via {account['phone_number']}..."
                logger.info(msg)
                await log_to_db(account.get('user_id'), 'INFO', msg)
                
                success, error = await mgr.send_message(contact_point, message_text)
                
                # Update Target Status
                status = 'sent' if success else 'failed'
                update_data = {
                    'status': status,
                    'sent_at': datetime.datetime.now().isoformat(),
                    'error_message': error
                }
                
                client.table('outreach_targets')\
                    .update(update_data)\
                    .eq('id', target['id'])\
                    .execute()

                if success:
                    await log_to_db(account.get('user_id'), 'SUCCESS', f"✅ Sent to {contact_point}")
                    
                    # Create Chat Entry
                    chat_data = {
                        'user_id': account['user_id'],
                        'account_id': account['id'],
                        'campaign_id': campaign['id'],
                        'target_username': contact_point.replace('@', '').strip(), # Normalize
                        'target_name': target.get('name') or contact_point,
                        'status': 'active',
                        'last_message_at': datetime.datetime.now().isoformat()
                    }
                    
                    # Upsert chat (in case it exists)
                    chat_insert = client.table('outreach_chats').upsert(chat_data, on_conflict='account_id, target_username').select().execute()
                    
                    # Save Initial Message
                    if chat_insert.data:
                        chat_id = chat_insert.data[0]['id']
                        client.table('outreach_messages').insert({
                            'chat_id': chat_id,
                            'sender': 'me',
                            'content': message_text,
                            'created_at': datetime.datetime.now().isoformat()
                        }).execute()

                else:
                    await log_to_db(account.get('user_id'), 'ERROR', f"❌ Failed to send to {contact_point}: {error}")
                
                # Stay online a bit
                await asyncio.sleep(random.uniform(5, 10))

    except Exception as e:
        logger.error(f"Error in process_account loop: {e}")
        logger.error(traceback.format_exc())
    finally:
        await mgr.disconnect()

async def run_worker():
    logger.info("Starting Outreach Worker...")
    
    while True:
        # 1. Check Schedule
        # Always check conversions even if sleeping for outreach
        await process_pending_conversions()

        if await is_sleeping_time():
            logger.info("Sleeping time (MSK). Pausing worker...")
            await asyncio.sleep(60 * 15) # Check every 15 mins
            continue

        # 2. Fetch Active Accounts
        try:
            response = db.get_client().table('outreach_accounts').select('*').eq('status', 'active').execute()
            accounts = response.data
        except Exception as e:
            logger.error(f"DB Error: {e}")
            await asyncio.sleep(60)
            continue
            
        if not accounts:
            logger.info("No active accounts found.")
            await asyncio.sleep(60)
            continue
            
        # 3. Process Accounts Sequentially
        for account in accounts:
            try:
                await process_account(account)
            except Exception as e:
                logger.error(f"Error processing account {account.get('id')}: {e}")
            
            # Wait between accounts (Random 30s - 2 mins)
            delay = random.uniform(30, 120)
            logger.info(f"Waiting {delay:.1f}s before next account...")
            await asyncio.sleep(delay)
            
        # End of cycle
        logger.info("Cycle completed. Waiting before restart...")
        await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(run_worker())
