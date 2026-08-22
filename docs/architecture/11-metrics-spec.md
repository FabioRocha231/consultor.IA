# 11 - Metrics Specification

Nomenclatura: `consultor_*` para métricas de produto; `http_*`, `db_*`, `process_*` para infra. Labels de baixa cardinalidade.

## Infra / plataforma

| Metric | Type | Labels |
| --- | --- | --- |
| `process_cpu_seconds_total` | counter | service, deployment_id, organization_id |
| `process_resident_memory_bytes` | gauge | idem |
| `process_open_fds` | gauge | idem |
| `nodejs_eventloop_lag_seconds` | histogram/gauge | idem |
| `http_server_duration_seconds` | histogram | service, route, method, status |
| `http_server_requests_total` | counter | service, route, method, status |
| `db_query_duration_seconds` | histogram | service, operation, table |
| `container_health` | gauge | deployment_id |
| `container_restart_count` | gauge | deployment_id |

## LLM

| Metric | Type | Labels |
| --- | --- | --- |
| `llm_requests_total` | counter | provider, model, organization_id |
| `llm_errors_total` | counter | provider, model, error_type |
| `llm_rate_limits_total` | counter | provider, model |
| `llm_input_tokens_total` | counter | provider, model, organization_id |
| `llm_output_tokens_total` | counter | provider, model, organization_id |
| `llm_latency_seconds` | histogram | provider, model |
| `llm_time_to_first_token_seconds` | histogram | provider, model |
| `llm_estimated_cost_usd_total` | counter | provider, model, organization_id |

## RAG

| Metric | Type | Labels |
| --- | --- | --- |
| `rag_queries_total` | counter | organization_id, workspace |
| `rag_retrieval_latency_seconds` | histogram | organization_id |
| `rag_chunks_retrieved` | histogram | organization_id |
| `rag_best_similarity_score` | histogram | organization_id |
| `rag_no_results_total` | counter | organization_id |
| `rag_fallback_total` | counter | fallback_type |
| `rag_human_handoff_total` | counter | organization_id |
| `embedding_latency_seconds` | histogram | provider, model |
| `embedding_errors_total` | counter | provider, model |

## Agents / tools

| Metric | Type | Labels |
| --- | --- | --- |
| `agent_runs_total` | counter | organization_id |
| `agent_failures_total` | counter | organization_id, error_type |
| `tool_calls_total` | counter | tool, organization_id |
| `tool_call_errors_total` | counter | tool, organization_id |
| `tool_latency_seconds` | histogram | tool, organization_id |
| `n8n_requests_total` | counter | tool, organization_id |
| `n8n_failures_total` | counter | tool, organization_id |
| `n8n_latency_seconds` | histogram | tool, organization_id |

## Documentos

| Metric | Type | Labels |
| --- | --- | --- |
| `document_ingestion_total` | counter | source_type, organization_id |
| `document_ingestion_failures_total` | counter | source_type, error_type |
| `document_processing_latency_seconds` | histogram | source_type |
| `embedding_jobs_total` | counter | status |
| `embedding_jobs_failed` | counter | reason |
| `knowledge_base_documents` | gauge | workspace, organization_id |

## Produto

| Metric | Type | Labels |
| --- | --- | --- |
| `conversations_total` | counter | organization_id |
| `messages_total` | counter | organization_id |
| `active_users` | gauge | organization_id |
| `feedback_positive_rate` | gauge | organization_id |
| `feedback_negative_rate` | gauge | organization_id |
| `unanswered_question_rate` | gauge | organization_id |
| `fallback_rate` | gauge | organization_id |
| `human_handoff_rate` | gauge | organization_id |
| `estimated_cost_per_conversation` | gauge | organization_id |
| `estimated_cost_per_company` | gauge | organization_id |

## Cardinalidade

- `organization_id` e `deployment_id`: baixa (3 empresas).
- Não usar `user_id`, `conversation_id` ou `prompt_hash` como label de métrica.
- `workspace` como label apenas se número de workspaces for pequeno; caso contrário, agregar em dashboard.

## Source

- LLM usage vem de `LLMPerformanceMonitor` e `addChatCostToMetrics` (`server/utils/helpers/chat/LLMPerformanceMonitor.js:78`, `server/utils/helpers/modelPricing/index.js:331`).
- Eventos de produto: hoje `EventLogs` (`server/models/eventLogs.js:7`); alvo: contadores OTel derivados.
