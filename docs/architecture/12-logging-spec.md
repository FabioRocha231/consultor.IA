# 12 - Logging Specification

## Princípio

Logs estruturados JSON com correlação. Nada de `console.log("deu erro")` solto.

## Schema base

```json
{
  "level": "info",
  "timestamp": "2026-08-22T18:32:00.000Z",
  "service": "consultor-ia",
  "event": "rag.retrieval.completed",
  "trace_id": "abc123",
  "span_id": "def456",
  "request_id": "req-1",
  "conversation_id": "thread-1",
  "organization_id": "company-a",
  "deployment_id": "deployment-a",
  "environment": "production",
  "duration_ms": 37,
  "status": "ok",
  "metadata": {}
}
```

## Eventos principais

| Event | Campos úteis |
| --- | --- |
| `http.request` | method, path, status, duration_ms, request_id |
| `chat.request` | conversation_id, mode, model, provider |
| `rag.retrieval.completed` | chunks, best_score, top_n, threshold, duration_ms |
| `rag.fallback` | fallback_type, no_context |
| `embedding.generate` | provider, model, duration_ms, errors |
| `llm.generate` | provider, model, input_tokens, output_tokens, cost_usd, duration_ms, ttft_ms |
| `agent.reasoning` | agent, model, tool_calls |
| `tool.call` | tool, organization_id, duration_ms, status |
| `n8n.webhook` | tool, correlation_id, status, duration_ms |
| `document.ingest` | filename_meta, size, status, duration_ms |
| `job.run` | job, status, duration_ms |
| `auth.login` | user_id, status (sem senha) |

## Campos permitidos por padrão

- IDs (`user_id`, `workspace_id`, `organization_id`, `conversation_id`, `thread_id`, `document_id`)
- metadata (tamanho, counts, latency, status, scores, cost)
- hashes (ex.: hash de documento/prompt quando necessário)
- model/provider/tool names

## Campos proibidos por padrão

- API keys
- Authorization headers / cookies
- Passwords / tokens
- Secret env vars
- Full prompts
- Full documents / full retrieved chunks
- Payloads sensíveis de integração
- Endereço IP do usuário (a menos que política de segurança exija, com justificativa e retenção)

## Implementação

- PR 02: trocar `server/utils/logger/index.js` por logger JSON OTel-aware.
- `server/middleware/httpLogger.js` atual só loga em dev (`server/index.js:58`); alvo: HTTP log estruturado sempre, com redação.
- `server/models/eventLogs.js` permanece para eventos de produto, mas logs operacionais vão para Loki.
- Redação: helper `redact(obj)` recursivo com chave `denylist` (`authorization`, `cookie`, `password`, `secret`, `token`, `apikey`, `api_key`).
- Sensitive Debug Mode: ver `10-observability-architecture.md` e `ADR-009`.

## Retenção

| Data | Retention default |
| --- | --- |
| Logs Loki | 30d |
| Traces Tempo | 15d |
| Metrics Prometheus | 30d (aggregates 1y) |
| Sensitive Debug Mode | 1h, auditável |

## Exemplo válido

```json
{
  "level": "info",
  "event": "rag.retrieval.completed",
  "trace_id": "abc123",
  "organization_id": "company-b",
  "conversation_id": "thread-99",
  "model": "gpt-4o",
  "chunks": 6,
  "best_score": 0.89,
  "duration_ms": 37
}
```

Não contém prompt, documento nem chunk.
