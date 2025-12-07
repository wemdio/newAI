import asyncio
import random
import datetime
import pytz
import base64
import os
import string
import socks
from urllib.parse import urlparse
from telethon import TelegramClient
from telethon.sessions import StringSession
from loguru import logger
from database import db
from account_manager import AccountManager

# ... imports

async def log_to_db(user_id, level, message):
    """Logs an event to the database for the user to see."""
    if not user_id:
        return
    try:
        # Truncate message if too long
        if len(message) > 1000:
            message = message[:1000] + "..."
            
        # Fire and forget-ish (await it but ignore result)
        # Note: supabase-py execute() is sync or async depending on client? 
        # In database.py we implemented custom `SupabaseClient` with `aiohttp`.
        # db.get_client() returns that instance?
        # Let's check database.py
        pass 
    except Exception:
        pass

# Actually let's check database.py content first.

    (18, 9),   # 18:00 to 09:00 MSK (Sleep)
    (12, 15)   # 12:00 to 15:00 MSK (Sleep)
]
MSK_TZ = pytz.timezone('Europe/Moscow')

def parse_proxy(proxy_url):
    if not proxy_url:
        return None
    try:
        parsed = urlparse(proxy_url)
        if parsed.scheme not in ['socks5', 'http', 'https']:
            return None

        p_type = socks.SOCKS5 if parsed.scheme == 'socks5' else socks.HTTP
        
        # Telethon accepts dict for proxy
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

async def convert_session_file(session_blob_b64, api_id, api_hash, phone, proxy_url=None):
    rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    temp_name = f"temp_{phone}_{rand_suffix}"
    
    proxy = parse_proxy(proxy_url)

    try:
        if not session_blob_b64:
            return None, "Empty session data"
            
        session_data = base64.b64decode(session_blob_b64)
        with open(temp_name + '.session', 'wb') as f:
            f.write(session_data)
        
        # Connect
        try:
            client = TelegramClient(temp_name, int(api_id), api_hash, proxy=proxy)
            await client.connect()
        except Exception as e:
             return None, f"Connect error: {e}"
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return None, "Unauthorized session"
            
        string_session = StringSession.save(client.session)
        await client.disconnect()
        return string_session, None
        
    except Exception as e:
        return None, str(e)
    finally:
        if os.path.exists(temp_name + '.session'):
            try:
                os.remove(temp_name + '.session')
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

async def process_account(account):
    """Processes a single account's outreach tasks."""
    account_id = account['id']
    
    # 1. Get campaigns assigned to this account
    # We need to find campaigns where this account_id is in the 'account_ids' array.
    client = db.get_client()
    
    # Postgres array contains check: account_ids @> {uuid}
    # Supabase-js: .cs('account_ids', [account_id])
    campaigns_resp = client.table('outreach_campaigns')\
        .select('*')\
        .eq('status', 'active')\
        .cs('account_ids', [account_id])\
        .execute()
        
    campaigns = campaigns_resp.data
    if not campaigns:
        logger.info(f"No active campaigns for account {account.get('phone_number')}")
        return

    # 2. Check Daily Limit (TODO: Implement real counter in DB)
    # For now, we assume we can send 1 message per cycle per account to be safe and slow.
    
    # 3. Pick a campaign (Randomly or First)
    campaign = random.choice(campaigns)
    
    # 4. Get Target
    target = await get_next_target(campaign['id'])
    if not target:
        logger.info(f"No pending targets for campaign {campaign['name']}")
        return

    # 5. Connect and Send
    mgr = AccountManager(account)
    if await mgr.connect():
        # Human-like delay before action
        await asyncio.sleep(random.uniform(2, 5))
        
        contact_point = target.get('username') or target.get('phone')
        message_text = campaign['message_template']
        
        # TODO: Template substitution (e.g. {name})
        
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
        
        if success:
            await log_to_db(account.get('user_id'), 'SUCCESS', f"✅ Sent to {contact_point}")
        else:
            await log_to_db(account.get('user_id'), 'ERROR', f"❌ Failed to send to {contact_point}: {error}")
        
        client.table('outreach_targets')\
            .update(update_data)\
            .eq('id', target['id'])\
            .execute()
            
        # Stay online a bit
        await asyncio.sleep(random.uniform(5, 10))
        await mgr.disconnect()
    else:
        # Connection failed - revert target to pending? or failed?
        # Let's mark as failed for now to avoid infinite loops on bad targets
        client.table('outreach_targets')\
            .update({'status': 'failed', 'error_message': 'Account connection failed'})\
            .eq('id', target['id'])\
            .execute()

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

