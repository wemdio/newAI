/**
 * Phoenix AI Observability — OpenTelemetry tracing setup.
 * Loaded via `node --import ./src/tracing.js` BEFORE the main app.
 *
 * Gracefully degrades: if PHOENIX_COLLECTOR_ENDPOINT is not set
 * or packages are missing, the app runs without tracing.
 */

const endpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT;

if (endpoint) {
  try {
    const { register } = await import('@arizeai/phoenix-otel');
    register({ projectName: 'lead-scanner-backend' });
    console.log(`[Tracing] Phoenix enabled → ${endpoint}`);
  } catch (e) {
    console.log(`[Tracing] Failed to initialize: ${e.message}`);
  }
} else {
  console.log('[Tracing] PHOENIX_COLLECTOR_ENDPOINT not set, skipping');
}
