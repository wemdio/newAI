// Per-client overrides only reduce batch size; other clients keep their defaults.
export const resolveAnalysisBatchSize = (
  configId,
  defaultSize = 5,
  overrides = process.env.AI_BATCH_SIZE_OVERRIDES
) => {
  const fallback = Number.isSafeInteger(defaultSize) && defaultSize > 0 ? defaultSize : 5;
  if (configId == null || !overrides) return fallback;
  try {
    const configured = JSON.parse(overrides);
    if (!configured || typeof configured !== 'object' || Array.isArray(configured) ||
        !Object.hasOwn(configured, String(configId))) return fallback;
    const size = configured[String(configId)];
    return Number.isSafeInteger(size) && size > 0 && size <= fallback ? size : fallback;
  } catch {
    return fallback;
  }
};
