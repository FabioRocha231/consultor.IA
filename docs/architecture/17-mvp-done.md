# 17 - MVP Definition of Done

O MVP (3 empresas piloto) está pronto quando:

## Product

- [ ] consultor.IA é white-label completo (nome, logo, favicon, metadata, textos, footer).
- [ ] Cliente não precisa configurar LLM, embeddings, vector DB, temperature, chunking, similarity ou agent internals.
- [ ] Onboarding orientado a negócio funciona: segmento, objetivo, conhecimento, comportamento, teste, publish.
- [ ] Organization existe e cada empresa tem seu deployment.

## Core

- [ ] Chat funciona (SSE, histórico, threads).
- [ ] Documentos são ingeridos (PDF, DOCX, links, texto) e embedidos.
- [ ] RAG funciona com configuração controlada (topK, threshold, citations, fallback).
- [ ] Fallback funciona: `dont_know`, `human_handoff` ou `general_llm` conforme config.
- [ ] Agentes funcionam com tools allowlisted.
- [ ] n8n integration funciona para as tools aprovadas.

## Privacy / Security

- [ ] Zero telemetria externa: sem PostHog, sem survey onboarding, sem Community Hub, sem domínio upstream no runtime.
- [ ] Outbound traffic auditado e allowlist documentada.
- [ ] Privacy CI gate existe e falha se telemetria for reintroduzida.
- [ ] Secrets não aparecem em logs/traces.
- [ ] Isolamento entre empresas: DB, Qdrant, documents, config e secrets por deployment.
- [ ] Webhook n8n assinado, com timeout, retry, idempotency e rate limit.

## Observability

- [ ] Logs estruturados com trace_id, request_id, conversation_id, organization_id.
- [ ] Traces distribuídos para chat, RAG, LLM, agent e n8n.
- [ ] Métricas principais (LLM, RAG, agent, docs, produto).
- [ ] Grafana permite diagnosticar uma conversa (cenário "Empresa B lenta às 15:32").
- [ ] Dashboards 01-09 disponíveis.
- [ ] Alertas essenciais configurados (P1/P2).

## Feedback / Analytics

- [ ] Feedback positivo/negativo funciona e está correlacionado a message/conversation/trace.
- [ ] Custos de LLM mensuráveis por empresa.
- [ ] Erros rastreáveis.

## Ops

- [ ] Backups básicos existem (DB, Qdrant, documents, config, secrets refs).
- [ ] Restore de uma empresa pode ser executado isoladamente.
- [ ] Rollback de um deployment não afeta os outros.
- [ ] Runbook de restore documentado.

## Formato de validação

- Testes automatizados passam.
- Smoke E2E por empresa: onboarding, upload, chat RAG, agent tool n8n, fallback, feedback.
- Teste de rede captura outbound e compara com allowlist.
- Revisão manual de Grafana com trace de exemplo.
