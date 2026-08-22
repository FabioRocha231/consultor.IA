# 14 - Grafana Dashboard Plan

Dashboards em `infra/grafana/dashboards/` (a criar) ou provisioning JSON no repo.

## 01 - Platform Health

- Availability
- Request rate / error rate
- P50/P95/P99 latency
- HTTP status distribution
- DB latency / connections
- CPU / RAM / Disk / Network
- Container health / restart count

## 02 - LLM Performance

- Requests/errors/rate limits
- Tokens (input/output)
- Latency P50/P95/P99
- TTFT
- Estimated cost por provider/model

## 03 - RAG Quality

- Queries
- Retrieval latency
- Chunks retrieved
- Best similarity score
- No results
- Fallback/human handoff
- Embedding latency/errors

## 04 - Agent & Tool Execution

- Agent runs/failures
- Tool calls/errors/latency
- Top tools
- Approval events

## 05 - n8n / Integrations

- Requests/failures/latency
- Tools
- Idempotency collisions
- Rate limit events

## 06 - Document Ingestion

- Ingestion total/failures
- Processing latency
- Embedding jobs
- Knowledge base document count

## 07 - Costs

- Estimated cost por empresa/provider/model/conversation
- Daily/weekly trend
- Alert on cost spike

## 08 - Company Overview

- Por empresa: availability, requests, latency, LLM errors, RAG fallback, tokens, cost, feedback
- Filtros: `organization_id`, `deployment_id`, período

## 09 - Errors & Incidents

- Error rate
- Top errors
- Traces com status error
- Recent error logs
- Tool/integration failures

## Correlação conversa

- Painel de trace: input `trace_id` ou `conversation_id`.
- Grafana Tempo + Loki: abrir trace, ver spans, logs correlacionados, métricas.
- Feedback: buscar mensagem por `conversation_id` e `organization_id`.
