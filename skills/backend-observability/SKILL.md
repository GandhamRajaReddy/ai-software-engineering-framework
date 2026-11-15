---
name: backend-observability
description: Backend observability engineering covering structured JSON logging, correlation IDs, OpenTelemetry distributed tracing, Prometheus RED metrics (Rate, Errors, Duration), and Kubernetes liveness/readiness health probes (/healthz, /readyz). Use when implementing logging, metrics, tracing, or health check infrastructure.
metadata:
  origin: ASEF
---

# Backend Observability & Telemetry

Production-grade observability patterns: structured logging, distributed tracing, metrics, and health probes.

## When to Activate

- Designing structured logging with correlation/trace IDs
- Instrumenting services with OpenTelemetry (tracing across HTTP and message queues)
- Exporting Prometheus metrics using the RED method (Rate, Errors, Duration)
- Implementing `/healthz` (liveness) and `/readyz` (readiness) probe endpoints
- Debugging distributed latency bottlenecks or intermittent error spikes

---

## 1. The Three Pillars of Backend Observability

```text
 ┌───────────────────────┐
 │   Distributed Tracing │ ──► End-to-end request journeys & latency breakdown
 └───────────────────────┘
 ┌───────────────────────┐
 │    Prometheus Metrics │ ──► Aggregate real-time health, alerts & trends (RED)
 └───────────────────────┘
 ┌───────────────────────┐
 │  Structured JSON Logs │ ──► High-cardinality debugging details tied to trace_id
 └───────────────────────┘
```

---

## 2. Structured JSON Logging

Every log entry must be valid JSON to allow parsing by ELK, Datadog, or Grafana Loki. Never output plain text unstructured strings.

### Standard Log Schema
```json
{
  "timestamp": "2026-05-15T14:32:10.123Z",
  "level": "INFO",
  "service": "order-service",
  "environment": "production",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "message": "Order processed successfully",
  "order_id": "ord_987123",
  "duration_ms": 42.5
}
```

### Express.js Pino Logger Middleware

```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token']
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) || uuidv4(),
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  }
});
```

---

## 3. Distributed Tracing (OpenTelemetry)

Propagate context across service boundaries using standard W3C `traceparent` headers (`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`).

```python
# FastAPI OpenTelemetry Instrumentation
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

def setup_telemetry(app, engine):
    provider = TracerProvider()
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
```

---

## 4. Prometheus Metrics: The RED Method

| Metric | Type | Metric Name | Purpose |
|--------|------|-------------|---------|
| **Rate** | Counter | `http_requests_total{method, route, status}` | Requests received per second |
| **Errors** | Counter | `http_requests_total{status=~"5.."}` | Errors encountered per second |
| **Duration** | Histogram | `http_request_duration_seconds_bucket{route}` | Request execution latency distribution |

```typescript
import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'node_' });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
});
```

---

## 5. Health Check Endpoints: Liveness & Readiness

Separate liveness (is process running?) from readiness (can it handle traffic?).

```typescript
// /healthz (Liveness) — simple process check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// /readyz (Readiness) — deep dependency check
app.get('/readyz', async (req, res) => {
  try {
    // 1. Check primary database connection
    await db.$queryRaw`SELECT 1`;

    // 2. Check Redis cache/broker
    const ping = await redis.ping();
    if (ping !== 'PONG') throw new Error('Redis ping failed');

    res.status(200).json({
      status: 'ready',
      checks: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});
```
