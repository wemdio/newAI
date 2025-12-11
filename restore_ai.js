const { execSync } = require('child_process');
const fs = require('fs');

const files = [
  { old: 'backend/src/services/messageAnalyzer.js', new: 'backend/backend/src/services/messageAnalyzer.js' },
  { old: 'backend/src/prompts/systemPrompt.js', new: 'backend/backend/src/prompts/systemPrompt.js' },
  { old: 'backend/src/prompts/promptBuilder.js', new: 'backend/backend/src/prompts/promptBuilder.js' }
];

files.forEach(f => {
  try {
    console.log(`Restoring ${f.new} from ${f.old}...`);
    const content = execSync(`git show 7706ff9:${f.old}`).toString();
    fs.writeFileSync(f.new, content);
    console.log(`Success!`);
  } catch (e) {
    console.error(`Failed to restore ${f.new}:`, e.message);
  }
});
