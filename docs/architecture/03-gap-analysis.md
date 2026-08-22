# 03 - Gap Analysis

Requisitos do handoff x capacidade atual. Prioridade P0 = MVP, P1 = pós-MVP, P2 = futuro.

| Requirement | Already supported? | Gap | Recommended solution | Priority |
| --- | --- | --- | --- | --- |
| Chat e streaming | SIM | - | KEEP | P0 |
| RAG com documentos | SIM | falta camada de produto/quality | KEEP + camada config/evaluation | P0 |
| Qdrant | PARCIAL | default LanceDB; adapter Qdrant existe | definir Qdrant por empresa | P0 |
| Zero external telemetry | NÃO | PostHog ativo, survey, Community Hub, model pricing/CDN | PR 01 remoção + allowlist | P0 |
| Maximum internal observability | NÃO | console/winston, HTTP logger dev-only | PR 02 OTel foundation | P0 |
| Tracing chat->RAG->LLM->n8n | NÃO | não há spans/trace_id | PR 02/PR 09 | P0 |
| Logs estruturados | NÃO | `server/utils/logger/index.js` usa printf | PR 02 schema JSON | P0 |
| Métricas LLM/RAG/agent | NÃO | só `stream.metrics` em memória | PR 02/PR 09/PR 12 | P0 |
| Company/organization | NÃO | não há entidade | PR 05 Organization | P0 |
| Isolamento 3 empresas | NÃO | conceitual deployment separado | PR 05 + ADR-003/004; deploy por empresa | P0 |
| Onboarding negócio | NÃO | onboarding técnico + survey externa | PR 03/PR 06 | P0 |
| RAG config layer | PARCIAL | workspace tem topN, similarityThreshold, chatMode, queryRefusalResponse, rerank | PR 07 abstrai para Organization + ACs | P0 |
| Controle de alucinação/fallback | PARCIAL | query mode com refusal response; não há `human_handoff`/`general_llm` | PR 07 | P0 |
| n8n integration | NÃO | não existe | PR 08 contrato assinado/allowlist | P0 |
| Tools seguras | PARCIAL | whitelist e approval existem; web/scrape/agent flow API call arbitrário | PR 08 restringe por default e allowlist | P0 |
| Feedback 👍/👎 | PARCIAL | feedbackScore booleano, sem categorias/reason | PR 10 | P1 |
| RAG evaluation | NÃO | - | PR 11 | P1 |
| Company dashboard/analytics | NÃO | event_logs simples | PR 12 | P1 |
| Privacy CI gate | NÃO | workflows lint/test/build existem, sem telemetry check | PR 13 | P0 para deploy |
| Backups e restore | NÃO | volumes locais | PR 05/17 deploy + runbook | P0 |
| White-label completo | PARCIAL | branding UI existe, mas assets/textos upstream em todo o frontend | PR 03 | P0 |
| Simplificação navegação | NÃO | UI admin técnica exposta | PR 04 | P0 |
| Multi-tenancy massivo | NÃO | intencional | ADR-003 deixa evolução possível | P2 |
| Human handoff | NÃO | pode começar como integração n8n/hook | PR 08 | P0/P1 |
| Sensitive debug | NÃO | - | PR 09 | P1 |
| Costs | PARCIAL | model pricing refresh remoto e addChatCostToMetrics | PR 09/PR 12 self-host/static pricing | P1 |
| Data retention | NÃO | - | PR 09/PR 12 | P1 |
| Secret handling | PARCIAL | env vars e encryption manager; secrets podem vazar em logs | PR 02/PR 09 | P0 |
| API keys | SIM | `api_keys` + `validApiKey` | KEEP | P0 |
| Roles | PARCIAL | admin/manager/default, sem org-level RBAC | KEEP no MVP; org-level no futuro | P1 |
| Embed | PARCIAL | embed widget completo, submodulo não inicializado | AUDIT antes do release | P0 |
| Browser extension | PARCIAL | endpoints server prontos; submodulo não inicializado | AUDIT antes do release | P0 |
