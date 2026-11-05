// Luna uses a schema-constrained object; the batch parser already accepts results.
export const buildBatchResponseFormat = model => model === 'openai/gpt-6-luna' ? {
  type: 'json_schema',
  json_schema: {
    name: 'lead_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              is_match: { type: 'boolean' },
              confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
              matched_criteria: { type: 'array', items: { type: 'string' } }
            },
            required: ['id', 'is_match', 'confidence_score', 'reasoning', 'matched_criteria'],
            additionalProperties: false
          }
        }
      },
      required: ['results'],
      additionalProperties: false
    }
  }
} : undefined;
