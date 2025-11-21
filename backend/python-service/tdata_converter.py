#!/usr/bin/env python3
"""
tdata to Telethon Session Converter
Uses opentele library to convert Telegram Desktop tdata to Telethon session
"""
import sys
import os
import asyncio
from pathlib import Path
from opentele.td import TDesktop
from opentele.tl import TelegramClient
from opentele.api import API, UseCurrentSession
import json


async def convert_tdata_to_session(tdata_path: str, session_path: str) -> dict:
    """
    Convert tdata folder to Telethon session file
    
    Args:
        tdata_path: Path to tdata folder
        session_path: Path where to save .session file
        
    Returns:
        dict with session info (api_id, api_hash, phone)
    """
    try:
        print(f"🔄 Loading tdata from: {tdata_path}")
        
        # Load TDesktop session
        tdesk = TDesktop(tdata_path)
        
        # Check if tdata is valid
        if not tdesk.isLoaded():
            raise Exception("Failed to load tdata - invalid or corrupted")
        
        print(f"✅ tdata loaded successfully")
        print(f"📱 Found {len(tdesk.accounts)} account(s)")
        
        if len(tdesk.accounts) == 0:
            raise Exception("No accounts found in tdata")
        
        # Use first account
        account = tdesk.accounts[0]
        print(f"👤 Account phone: {account.phone if hasattr(account, 'phone') else 'Unknown'}")
        
        # Convert to Telethon
        print(f"🔄 Converting to Telethon session...")
        
        # Create Telethon client from tdata
        client = await account.ToTelethon(
            session=session_path,
            flag=UseCurrentSession
        )
        
        # Get account info
        me = await client.get_me()
        phone = me.phone if me.phone else "Unknown"
        
        print(f"✅ Conversion successful!")
        print(f"📱 Phone: {phone}")
        print(f"👤 Username: @{me.username if me.username else 'No username'}")
        print(f"🆔 User ID: {me.id}")
        
        # Get API credentials from the session
        # Note: opentele extracts API ID and Hash from tdata
        api_id = client.api_id
        api_hash = client.api_hash
        
        # Disconnect client
        await client.disconnect()
        
        return {
            "success": True,
            "session_file": session_path,
            "phone": phone,
            "api_id": api_id,
            "api_hash": api_hash,
            "user_id": me.id,
            "username": me.username
        }
        
    except Exception as e:
        print(f"❌ Conversion failed: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


async def main():
    """CLI entry point"""
    if len(sys.argv) < 3:
        print("Usage: python tdata_converter.py <tdata_path> <session_output_path>")
        sys.exit(1)
    
    tdata_path = sys.argv[1]
    session_path = sys.argv[2]
    
    if not os.path.exists(tdata_path):
        print(f"❌ tdata path not found: {tdata_path}")
        sys.exit(1)
    
    result = await convert_tdata_to_session(tdata_path, session_path)
    
    # Print result as JSON for Node.js to parse
    print("\n=== RESULT ===")
    print(json.dumps(result))
    
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    asyncio.run(main())
