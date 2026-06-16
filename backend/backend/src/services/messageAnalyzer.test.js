import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadAnalysisCompletionParams } from './messageAnalyzer.js';

describe('buildLeadAnalysisCompletionParams', () => {
  test('does NOT send reasoning params (they break non-reasoning deepseek-chat and force fallback to the pricey reasoning model)', () => {
    const params = buildLeadAnalysisCompletionParams({
      model: 'policy/lead-analysis',
      messages: [
        { role: 'system', content: 'criteria' },
        { role: 'user', content: 'message' }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    // Neither reasoning shape may be present — deepseek-chat (the policy primary)
    // rejects them, which silently routed all analysis traffic to deepseek-v4-flash.
    assert.equal('reasoning' in params, false);
    assert.equal('reasoning_effort' in params, false);
    // Core params still pass through unchanged.
    assert.equal(params.model, 'policy/lead-analysis');
    assert.equal(params.temperature, 0.1);
    assert.equal(params.max_tokens, 4000);
  });
});
