// Keep the cursor before the first failure, while avoiding repeated paid analysis
// of later messages that have already completed in this polling page.
export const processScanPage = async (messages, previousId, completedIds, processMessages) => {
  const pending = messages.filter(message => !completedIds.has(String(message.id)));
  const failures = new Set((await processMessages(pending)).map(String));
  const pendingIds = new Set(pending.map(message => String(message.id)));
  for (const id of failures) {
    if (!pendingIds.has(id)) throw new Error('Failure ID does not belong to scan page');
  }
  for (const message of pending) {
    if (!failures.has(String(message.id))) completedIds.add(String(message.id));
  }
  let lastProcessedId = previousId;
  for (const message of messages) {
    if (!completedIds.has(String(message.id))) break;
    lastProcessedId = message.id;
    completedIds.delete(String(message.id));
  }
  return { lastProcessedId, failedIds: [...failures] };
};
