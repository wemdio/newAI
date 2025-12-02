import codecs
import os

file_path = 'src/pages/Leads.jsx'

try:
    print(f"Fixing encoding for {file_path}...")
    
    # Read content - handling BOM if present
    # 'utf-8-sig' reads UTF-8 with BOM and removes it, or just UTF-8
    with codecs.open(file_path, 'r', 'utf-8-sig') as f:
        content = f.read()
        
    # Write content back as pure UTF-8 (no BOM)
    with codecs.open(file_path, 'w', 'utf-8') as f:
        f.write(content)
        
    print("✅ Success: File rewritten as UTF-8 (No BOM)")
    
except Exception as e:
    print(f"❌ Error: {e}")

