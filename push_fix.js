const { execSync } = require('child_process');
const fs = require('fs');

try {
  console.log('Starting git operations...');
  
  // Check status
  console.log('Status:');
  console.log(execSync('git status').toString());
  
  // Switch to production
  console.log('Checking out production...');
  execSync('git checkout production');
  
  // Merge main
  console.log('Merging main...');
  execSync('git merge main');
  
  // Push
  console.log('Pushing to production...');
  execSync('git push origin production');
  
  console.log('Success!');
  fs.writeFileSync('git_result.txt', 'SUCCESS');
} catch (error) {
  console.error('Error:', error.message);
  if (error.stdout) console.log('Stdout:', error.stdout.toString());
  if (error.stderr) console.log('Stderr:', error.stderr.toString());
  fs.writeFileSync('git_result.txt', 'ERROR: ' + error.message);
}























