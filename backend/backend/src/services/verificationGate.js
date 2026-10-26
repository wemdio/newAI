// Keep provider outages separate from final negative verdicts, without a hot retry loop.
export const createVerificationGate = (verify, now = Date.now) => {
  const retryAt = new Map();
  return {
    retryAt,
    async check(message, analysis, criteria, apiKey, userId) {
      const remaining = (retryAt.get(userId) || 0) - now();
      if (remaining > 0) {
        return { verified: false, retryable: true, retryAfterMs: remaining, reasoning: 'Verification cooldown' };
      }
      let result;
      try {
        result = await verify(message, analysis, criteria, apiKey, userId);
      } catch {
        result = { verified: false, retryable: true, reasoning: 'Verification failed - retry required' };
      }
      if (!result || typeof result.verified !== 'boolean' || result.retryable) {
        const delay = Number(result?.retryAfterMs);
        const retryAfterMs = Number.isFinite(delay) ? Math.max(60000, delay) : 60000;
        retryAt.set(userId, now() + retryAfterMs);
        return { ...result, verified: false, retryable: true, retryAfterMs };
      }
      retryAt.delete(userId);
      return result;
    }
  };
};
