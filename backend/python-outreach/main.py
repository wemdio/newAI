import asyncio
import random
import datetime
import pytz
from loguru import logger
from database import db
from account_manager import AccountManager

# Configuration
SLEEP_PERIODS = [
    (18, 9),   # 18:00 to 09:00 MSK (Sleep)
    (12, 15)   # 12:00 to 15:00 MSK (Sleep)
]
MSK_TZ = pytz.timezone('Europe/Moscow')

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
        
        logger.info(f"Sending to {contact_point} via {account['phone_number']}...")
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

