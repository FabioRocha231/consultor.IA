# 14 - Grafana Dashboard Plan

Implementado no PR 21 como provisioning JSON em `infra/grafana/dashboards/`.
Os datasources provisionados usam `uid` fixo (`prometheus`, `loki`, `tempo`)
para os dashboards serem portáveis entre ambientes.

## Dashboards provisionados

| Arquivo | Conteúdo |
| --- | --- |
| `01-platform-health.json` | Availability, CPU/RAM/disk, restarts, status Postgres/Qdrant/Alloy/n8n, request/error rate, HTTP P95, DB P95 |
| `02-http-api.json` | req/s, 2xx/4xx/5xx, P50/P95/P99, status distribution, slowest endpoints |
| `03-llm-performance.json` | requests/errors por provider/model, tokens, latência, TTFT, rate limits, custo estimado |
| `04-rag-quality.json` | queries, retrieval latency, chunks, best similarity, no-result, fallback, handoff, config source, reranking |
| `05-agent-execution.json` | runs/failures, tool calls/errors, tool latency, top tools, iterations, approval events |
| `06-n8n-integrations.json` | requests, success/failure, latência, retry rate, timeouts, tool distribution |
| `07-document-ingestion.json` | ingestion success/failure, embedding jobs/failures, processing latency, knowledge base docs |
| `08-cost.json` | custo total/trend, por provider/model/empresa, custo/tokens por chamada, conversa e mensagem |
| `09-company-overview.json` | painel por organização: availability, conversas, mensagens, usuários, P95, fallback, handoff, erros, custo, feedback, feedback traces |

## Métricas atuais

O source de verdade é o código OTel:

- `server/utils/observability/ai.js`: LLM, RAG, agent, tool, document, embedding, eval.
- `server/utils/observability/integrations.js`: n8n.
- `docs/architecture/11-metrics-spec.md`: spec de labels.

Métricas que ainda não são emitidas ficam com `TODO` no JSON e query
placeholder. Nenhuma métrica deve ser inventada no dashboard.

## Métricas pendentes (TODO)

- HTTP: `http_server_requests_total`, `http_server_duration_seconds`.
- Infra: `process_cpu_seconds_total`, `process_resident_memory_bytes`,
  `node_filesystem_*`, `container_restart_count`, `db_query_duration_seconds`.
- Produto: `conversations_total`, `messages_total`, `active_users`,
  `feedback_positive_total`, `feedback_negative_total`,
  `knowledge_base_documents`.
- RAG: `rag_config_source_total`, `rag_reranking_total`.
- Agent: `agent_iterations_total`, `agent_approval_events_total`.
- n8n: `n8n_retries_total`.
- Documento: `document_processing_latency_seconds`.

## Labels

- LLM usa `organization` hoje; a spec alvo é `organization_id`.
- RAG hoje usa `vector_db`, `fallback.kind` e não tem `organization`.
- n8n usa `tool`, `organization`, `result`, `error.kind`.
- `deployment_id` ainda não é emitido; filtros manuais por `organization`
  cobrem o MVP de 1 deployment por empresa.

## Correlação conversa

- Painel `Feedback Traces` em `09-company-overview.json` usa TraceQL:
  `{ resource.service.name = "consultor-ia" && span.feedback.score != "" }`.
- Isso funciona sem o PR 17. Quando o PR 17 persistir `trace_id` em
  `workspace_chats`, o operador pode abrir o mesmo trace pelo ID salvo no
  feedback sem depender do TraceQL.
- Tempo + Loki permitem abrir trace e logs correlacionados via `trace_id`.
- Feedback no banco continua buscável por `conversation_id` e `organization_id`.
