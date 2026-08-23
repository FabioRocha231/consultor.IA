# Grafana Alloy

Local development receiver for OTLP telemetry emitted by the server.

```bash
docker run --rm \
  -p 4317:4317 \
  -p 4318:4318 \
  -v "$PWD/config.alloy:/etc/alloy/config.alloy" \
  grafana/alloy:latest \
  run --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy
```

The server should export to `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.
Alloy forwards metrics to Prometheus, logs to Loki, and traces to Tempo at the
default service names used by a local LGTM stack.
