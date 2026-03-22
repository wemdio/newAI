"""Phoenix AI Observability — OpenTelemetry tracing setup for Python services.

Gracefully degrades: if PHOENIX_COLLECTOR_ENDPOINT is not set
or packages are missing, returns a no-op context manager.
"""

import json
import os
from contextlib import contextmanager

_tracer = None
_enabled = False
_StatusCode = None


def _init():
    global _tracer, _enabled, _StatusCode

    endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
    if not endpoint:
        print("[Tracing] PHOENIX_COLLECTOR_ENDPOINT not set, skipping")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource

        resource = Resource.create({"service.name": "lead-scanner-python"})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _tracer = trace.get_tracer("lead-scanner-python")
        _StatusCode = trace.StatusCode
        _enabled = True
        print(f"[Tracing] Phoenix enabled -> {endpoint}")
    except Exception as e:
        print(f"[Tracing] Failed to initialize: {e}")


_init()

_REQUIRED_FIELDS = ("is_lead", "confidence", "reasoning")


def _run_code_evals(span, output: str):
    """Attach eval.valid_json and eval.has_required_fields to the span."""
    text = output.strip()
    if not text.startswith("{"):
        return
    try:
        parsed = json.loads(text)
        span.set_attribute("eval.valid_json", True)
        missing = [f for f in _REQUIRED_FIELDS if f not in parsed]
        span.set_attribute("eval.has_required_fields", len(missing) == 0)
        span.set_attribute("eval.missing_fields", ",".join(missing))
    except (json.JSONDecodeError, TypeError):
        span.set_attribute("eval.valid_json", False)
        span.set_attribute("eval.has_required_fields", False)


@contextmanager
def trace_llm_call(name: str, model: str, input_text: str = ""):
    """Context manager that wraps an LLM call in an OpenTelemetry span.

    Usage:
        with trace_llm_call("ai_communicator", "gemini-3-flash", prompt) as set_output:
            response = await call_api(...)
            set_output(output=response)
    """
    if not _enabled or _tracer is None:
        yield lambda **_kw: None
        return

    with _tracer.start_as_current_span(name) as span:
        span.set_attribute("openinference.span.kind", "LLM")
        span.set_attribute("llm.model_name", model)
        if input_text:
            span.set_attribute("input.value", input_text[:4000])

        def set_output(output: str = "", token_total: int = 0, error: str = ""):
            if output:
                span.set_attribute("output.value", output[:4000])
                _run_code_evals(span, output)
            if token_total:
                span.set_attribute("llm.token_count.total", token_total)
            if error:
                span.set_attribute("error.message", error)
                if _StatusCode:
                    span.set_status(_StatusCode.ERROR, error)

        yield set_output
