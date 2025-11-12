"""TData Converter - Converts Telegram Desktop tdata to Telethon session"""
import os
import subprocess
import json
from pathlib import Path
from typing import Tuple, Optional


class TDataConverter:
    """
    Converts Telegram Desktop tdata to Telethon .session file
    
    This module integrates with TGConvertor or similar tools to extract
    session data from Telegram Desktop's tdata folder and create a
    Telethon-compatible session file.
    """
    
    def __init__(self, tgconvertor_path: Optional[str] = None):
        """
        Initialize converter
        
        Args:
            tgconvertor_path: Path to TGConvertor executable
                             If None, will look in common locations
        """
        self.tgconvertor_path = tgconvertor_path or self._find_tgconvertor()
    
    def _find_tgconvertor(self) -> Optional[str]:
        """Try to find TGConvertor in common locations"""
        possible_paths = [
            './TGConvertor',
            './TGConvertor/TGConvertor.exe',
            './tools/TGConvertor',
            '/usr/local/bin/tgconvertor'
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                return path
        
        return None
    
    async def convert_tdata_to_session(
        self, 
        tdata_path: str, 
        output_session_name: str
    ) -> Tuple[str, int, str]:
        """
        Convert tdata folder to Telethon session
        
        Args:
            tdata_path: Path to tdata folder
            output_session_name: Name for output session file (without .session)
        
        Returns:
            Tuple of (session_file_path, api_id, api_hash)
        
        Raises:
            Exception if conversion fails
        """
        if not os.path.exists(tdata_path):
            raise FileNotFoundError(f"TData path not found: {tdata_path}")
        
        # Method 1: Use TGConvertor if available
        if self.tgconvertor_path and os.path.exists(self.tgconvertor_path):
            return await self._convert_with_tgconvertor(tdata_path, output_session_name)
        
        # Method 2: Manual extraction (simplified)
        # Note: This is a placeholder - actual implementation would need
        # to properly parse tdata structure
        return await self._convert_manual(tdata_path, output_session_name)
    
    async def _convert_with_tgconvertor(
        self, 
        tdata_path: str, 
        output_session_name: str
    ) -> Tuple[str, int, str]:
        """
        Convert using TGConvertor tool
        
        TGConvertor command format:
        TGConvertor --tdata <path> --output <name> --format telethon
        """
        output_path = f"sessions/{output_session_name}.session"
        
        try:
            # Run TGConvertor
            result = subprocess.run([
                self.tgconvertor_path,
                '--tdata', tdata_path,
                '--output', output_path,
                '--format', 'telethon',
                '--json-output'  # Request JSON output with credentials
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                raise Exception(f"TGConvertor failed: {result.stderr}")
            
            # Parse output to extract API credentials
            output_data = json.loads(result.stdout)
            api_id = output_data.get('api_id')
            api_hash = output_data.get('api_hash')
            
            if not api_id or not api_hash:
                # Try to extract from tdata manually
                api_id, api_hash = self._extract_api_from_tdata(tdata_path)
            
            print(f"✅ Converted tdata to session: {output_path}")
            return (output_path, api_id, api_hash)
            
        except subprocess.TimeoutExpired:
            raise Exception("TGConvertor timeout")
        except json.JSONDecodeError:
            # Fallback: try to extract manually
            return await self._convert_manual(tdata_path, output_session_name)
        except Exception as e:
            raise Exception(f"Conversion failed: {str(e)}")
    
    async def _convert_manual(
        self, 
        tdata_path: str, 
        output_session_name: str
    ) -> Tuple[str, int, str]:
        """
        Manual conversion (fallback method)
        
        This is a placeholder for manual tdata parsing.
        In production, you would need to:
        1. Parse tdata structure
        2. Extract auth key and session data
        3. Create Telethon session file
        4. Extract API credentials
        
        For now, this raises an error indicating manual setup needed.
        """
        raise NotImplementedError(
            "Manual tdata conversion not implemented. "
            "Please install TGConvertor or provide session file directly. "
            "Alternatively, you can use phone login to create sessions."
        )
    
    def _extract_api_from_tdata(self, tdata_path: str) -> Tuple[int, str]:
        """
        Extract API ID and Hash from tdata
        
        Note: This is a simplified placeholder.
        Actual implementation depends on tdata structure.
        """
        # Check for common locations
        config_files = [
            os.path.join(tdata_path, 'configs'),
            os.path.join(tdata_path, 'settings'),
        ]
        
        # Placeholder: In production, parse actual tdata structure
        # For now, return common public Telegram API credentials
        # Users should replace with their own
        
        raise ValueError(
            "Could not extract API credentials from tdata. "
            "Please provide api_id and api_hash manually when uploading."
        )
    
    def validate_session(self, session_path: str) -> bool:
        """
        Validate that session file exists and is readable
        
        Args:
            session_path: Path to .session file
        
        Returns:
            True if valid, False otherwise
        """
        if not os.path.exists(session_path):
            return False
        
        # Check file size (should not be empty)
        if os.path.getsize(session_path) < 100:
            return False
        
        return True


# Helper function for direct use
async def convert_tdata(tdata_path: str, output_name: str) -> dict:
    """
    Convenience function to convert tdata
    
    Returns:
        Dict with session_file, api_id, api_hash
    """
    converter = TDataConverter()
    session_file, api_id, api_hash = await converter.convert_tdata_to_session(
        tdata_path, 
        output_name
    )
    
    return {
        'session_file': session_file,
        'api_id': api_id,
        'api_hash': api_hash
    }

