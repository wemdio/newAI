// Never turn an unassigned model answer into a negative verdict for a real message.
export const mapBatchResults = (messages, responses) => {
  if (!Array.isArray(responses)) throw new Error('Expected an array of AI results');
  const byId = new Map();
  const duplicates = new Set();
  for (const result of responses) {
    const id = result?.id == null ? '' : String(result.id).trim();
    if (!id) continue;
    if (byId.has(id)) duplicates.add(id);
    byId.set(id, result);
  }
  return messages.map(message => {
    const id = String(message.id);
    return duplicates.has(id) ? null : (byId.get(id) || null);
  });
};
