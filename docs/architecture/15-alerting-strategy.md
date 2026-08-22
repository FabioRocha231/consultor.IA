# 15 - Alerting Strategy

Classificação: P1 = incidente, P2 = degradação, P3 = aviso.

| Alert | Metric/condition | Severity |
| --- | --- | --- |
| Service down | `up == 0` ou healthcheck | P1 |
| P95 > threshold (ex.: 5s por 5m) | `http_server_duration_seconds` p95 | P2 |
| LLM error rate > 5% | `llm_errors_total / llm_requests_total` | P2 |
| LLM rate limit > 0 | `llm_rate_limits_total` | P3 |
| Qdrant unavailable | `up{qdrant} == 0` ou `qdrant.search` errors | P1 |
| DB connections exhausted | `db_connections` near max | P1 |
| Disk usage > 85% | node exporter | P1 |
| Ingestion failures > 3/5m | `document_ingestion_failures_total` | P2 |
| Fallback rate anomalo | `rag_fallback_total` desvio de baseline | P3 |
| Cost spike | `llm_estimated_cost_usd_total` increase > 50% | P2 |
| n8n failure rate > 10% | `n8n_failures_total / n8n_requests_total` | P2 |
| Container restart loop | `container_restart_count` increase | P1 |
| Sensitive debug enabled | event `debug_mode_enabled` | P2 |
| Unanswered/handoff alto | `unanswered_question_rate` ou `human_handoff_rate` | P3 |

## Anti alert fatigue

- Alertas P3 só em dashboards, não páginas.
- Baseline por empresa (A/B/C têm comportamentos diferentes).
- Silenciamento por manutenção com janela.
- Testar alertas no staging antes de produção.
- Cada alerta deve ter runbook: quem, o que, como verificar, rollback.
