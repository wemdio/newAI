const DEFAULT_MODEL = 'qwen/qwen-2.5-72b-instruct';
const isModelId = value => typeof value === 'string' && value === value.trim() && value.length <= 200 &&
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i.test(value);

// Opt-in per-config routing; unconfigured clients retain the global model.
export const resolveAnalysisModel = (
  configId,
  defaultModel = process.env.AI_MODEL || DEFAULT_MODEL,
  overrides = process.env.AI_MODEL_OVERRIDES
) => {
  const fallback = defaultModel;
  const id = String(configId);
  if (configId == null || id !== id.trim() || !/^[1-9]\d*$/.test(id) || !overrides) return fallback;
  try {
    const configured = JSON.parse(overrides);
    if (!configured || typeof configured !== 'object' || Array.isArray(configured) ||
        !Object.hasOwn(configured, id)) return fallback;
    const model = configured[id];
    return isModelId(model) ? model : fallback;
  } catch {
    return fallback;
  }
};
