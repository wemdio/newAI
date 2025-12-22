const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('openrouter_activity_2025-12-16.csv');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const stats = {};
  let totalCost = 0;
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
        isHeader = false;
        continue;
    }
    // Simple CSV parsing (assuming no commas in fields for now, or handling basically)
    // The relevant fields are cost_total (idx 2) and model_permaslug (idx 10)
    // CSV structure: generation_id,created_at,cost_total,...
    
    const parts = line.split(',');
    if (parts.length < 11) continue;

    const cost = parseFloat(parts[2]) || 0;
    const model = parts[10];

    if (!stats[model]) {
        stats[model] = { count: 0, cost: 0, prompt_tokens: 0, completion_tokens: 0 };
    }
    stats[model].count++;
    stats[model].cost += cost;
    stats[model].prompt_tokens += parseInt(parts[7]) || 0;
    stats[model].completion_tokens += parseInt(parts[8]) || 0;
    totalCost += cost;
  }

  console.log('Total Cost:', totalCost.toFixed(4));
  console.log('By Model:');
  for (const [model, data] of Object.entries(stats)) {
      console.log(`- ${model}: $${data.cost.toFixed(4)} (${data.count} reqs, ${data.prompt_tokens} prompt toks, ${data.completion_tokens} compl toks)`);
  }
}

processLineByLine();





