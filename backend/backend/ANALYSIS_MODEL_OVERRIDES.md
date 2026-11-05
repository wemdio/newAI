# Per-Client Primary Models

`AI_MODEL_OVERRIDES` is an optional JSON object mapping `user_config.id` to a
primary model ID. It affects both batch and individual analysis, including the
individual fallback after a failed batch and the authenticated prompt-test
endpoint. Test requests resolve the config from the authenticated user's ID,
not a config ID supplied in the request body. The verifier route is not changed.

Example for config 2 only:

```env
AI_MODEL_OVERRIDES={"2":"openai/gpt-6-luna"}
```

Set this on the intended backend application only, not as a global Timeweb
variable. Merge with existing entries rather than overwriting them. Model IDs
must be provider/model strings; malformed JSON or invalid overrides leave the
global `AI_MODEL` route unchanged. The root Docker Compose file forwards this
variable to the `api` service only.

The tested Luna primary requests schema-constrained batch output in a `results`
object, which the existing ID-based batch parser accepts. Other primary models
retain their existing array prompts and completion parameters. Individual
analysis retains its existing JSON-object format.

## Rollout

1. Test the exact client criteria and model on labeled real messages, negative
   controls, mixed batches, and individual requests. Preserve raw confidence.
2. Check the target application's deployed commit and automatic-deploy settings
   before pushing. Do not deploy unrelated applications.
3. Deploy the code with an override for the tested config, then update only that
   config's criteria using a guarded update. Preserve the global model,
   verification settings, confidence threshold, sleep window, and chat lists.
4. Confirm the resolved model in request logs, not only the configured model.
   Verify new lead delivery when a qualifying message arrives during processing
   hours. Historical replays must not send Telegram notifications.

## Rollback

Restore the previous environment value (or remove only the affected entry),
redeploy the same backend application, and restore that client's previous
criteria. No database schema changes are needed.
