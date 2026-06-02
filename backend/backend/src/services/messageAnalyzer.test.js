import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadAnalysisCompletionParams } from './messageAnalyzer.js';

describe('buildLeadAnalysisCompletionParams', () => {
  test('disables Requesty reasoning for lead analysis calls', () => {
    const params = buildLeadAnalysisCompletionParams({
      model: 'policy/lead-analysis',
      messages: [
        { role: 'system', content: 'criteria' },
        { role: 'user', content: 'message' }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    assert.equal(params.reasoning_effort, 'none');
    // The structured reasoning object is what the gateway actually honors
    assert.deepEqual(params.reasoning, { enabled: false, effort: 'none' });
  });
});
