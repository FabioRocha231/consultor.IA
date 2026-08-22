# 16 - PR Roadmap

Sequência proposta e justificativa de dependências. Cada PR deve ser pequeno, reversível e com `[SPEC CONFIRMED]` antes de implementar.

```text
PR 01 privacy/remove-upstream-telemetry
  -> PR 02 observability/otel-foundation
  -> PR 03 branding/consultor-ia
  -> PR 04 product/simplified-navigation
  -> PR 05 domain/organization
  -> PR 06 onboarding/company-setup
  -> PR 07 rag/config-layer
  -> PR 08 integrations/n8n-tools
  -> PR 09 observability/ai-tracing
  -> PR 10 feedback/message-rating
  -> PR 11 rag/evaluation-suite
  -> PR 12 analytics/company-dashboard
  -> PR 13 privacy/network-ci-gate
```

PR 02 depende do PR 01 para não instrumentar código que será removido. PR 09 depende do PR 02. PR 08 depende do PR 05/06 para ter organization/integrations config. PR 12 depende de PR 09/10/11 para dados de qualidade. PR 13 pode começar em paralelo, mas entra antes de produção.

## PR 01 - privacy/remove-upstream-telemetry

- **Objective**: zero telemetria externa e soberania de dados.
- **Scope**: remover PostHog, survey onboarding, Community Hub (feature completa) e dependências/configs relacionados.
- **Modules/files**: `server/package.json`, `server/yarn.lock`, `server/models/telemetry.js`, `server/utils/telemetry/index.js`, `server/utils/boot/index.js`, todas as chamadas `Telemetry.*` em `server/endpoints/**`, `server/models/**`, `server/utils/**`, `server/jobs/**`, `frontend/src/pages/OnboardingFlow/Steps/Survey`, `frontend/src/utils/constants.js`, `frontend/src/pages/GeneralSettings/PrivacyAndData`, `frontend/src/components/SettingsSidebar`, `server/endpoints/communityHub.js`, `server/models/communityHub.js`, `frontend/src/pages/GeneralSettings/CommunityHub/**`, `frontend/src/models/communityHub.js`, `README.md`, `TERMS_SELF_HOSTED.md`, `server/.env.example`, `docker/.env.example`, `cloud-deployments/helm/charts/anythingllm/values.yaml`.
- **Architecture impact**: remove camada de telemetria; nada do core muda.
- **Contract changes**: nenhum contrato público de API muda (exceto remoção de endpoints de telemetria/community hub internos).
- **Acceptance criteria**: `rg -i 'posthog|telemetry|onboarding.anythingllm|hub.anythingllm|hub.external.anythingllm'` sem hits em código funcional; testes existentes atualizados; build passa.
- **Tests**: ajustar mocks de Telemetry; testes de boot sem telemetria; teste estático de proibição de domínios/SDKs.
- **Observability added**: nenhum (PR 02).
- **Security**: remove vazamento de PII e events para Mintplex/PostHog.
- **Upstream conflict risk**: ALTO no diff, baixo no comportamento; usar ADR-010 para sync.
- **Dependencies**: nenhuma.
- **Rollback**: reverter PR; sem migração destrutiva (remover `telemetry_id` pode ficar como migration no mesmo PR com backup).

## PR 02 - observability/otel-foundation

- **Objective**: base OTel, structured logs, request/trace correlation.
- **Scope**: dependências OTel, `server/utils/observability/*`, middleware HTTP, logger JSON, env `OTEL_*`, Alloy config mínima, healthcheck.
- **Modules/files**: `server/package.json`, `server/yarn.lock`, `server/index.js`, `server/utils/logger/*`, `server/middleware/httpLogger.js`, novos `server/utils/observability/*`, `docker/.env.example`, `infra/alloy/*` (a criar).
- **Architecture impact**: adiciona camada transversal sem alterar lógica de negócio.
- **Contract changes**: `trace_id`/`request_id` em logs; nenhuma API pública muda.
- **Acceptance criteria**: request HTTP gera trace; logs JSON com campos obrigatórios; OTLP chega no Alloy local; metrics de infra aparecem no Prometheus.
- **Tests**: teste de middleware (request_id/trace), teste de logger/redação, smoke de OTLP (mock collector).
- **Observability added**: traces HTTP, logs estruturados, metrics de processo/HTTP.
- **Security**: redação de secrets.
- **Upstream conflict risk**: baixo, novos arquivos.
- **Dependencies**: PR 01.
- **Rollback**: reverter PR; sem dados sensíveis persistidos.

## PR 03 - branding/consultor-ia

- **Objective**: white-label completo.
- **Scope**: nome, logo, favicon, metadata, textos, footer, docs links, onboarding copy, default app name, colors.
- **Modules/files**: `frontend/public/`, `frontend/src/media/`, `frontend/src/index.html`, `frontend/src/main.jsx`, `frontend/src/utils/paths.js`, `frontend/src/components/Footer`, `frontend/src/components/Sidebar`, `frontend/src/pages/OnboardingFlow`, `server/utils/boot/MetaGenerator.js`, `README.md`.
- **Architecture impact**: substitui brand layer, não core.
- **Contract changes**: URLs de docs/support trocam para canais consultor.IA.
- **Acceptance criteria**: sem marca AnythingLLM visível; favicon/title/logo corretos; termos em PT-BR para cliente.
- **Tests**: screenshot/visual QA, unit de MetaGenerator.
- **Observability added**: nenhuma.
- **Security**: remove links externos upstream indesejados.
- **Upstream conflict risk**: médio/alto em texto/assets; usar configuração onde possível.
- **Dependencies**: PR 01 (evita propagar marca/telemetria).
- **Rollback**: reverter assets.

## PR 04 - product/simplified-navigation

- **Objective**: cliente não vê configuração técnica.
- **Scope**: esconder LLM/embedding/vector/text-splitter/model router/developer settings por role; criar navegação business.
- **Modules/files**: `frontend/src/components/SettingsSidebar/index.jsx`, `frontend/src/main.jsx`, `frontend/src/components/PrivateRoute`, `frontend/src/pages/WorkspaceSettings`, `frontend/src/components/WorkspaceChat`.
- **Architecture impact**: UX e RBAC de UI.
- **Contract changes**: rotas existentes permanecem para admin; novas rotas de produto no PR 06.
- **Acceptance criteria**: user default não vê tech settings; admin acessa por path direct; navegação não quebra.
- **Tests**: component/e2e de menu por role.
- **Observability added**: event `ui.navigation` opcional.
- **Security**: reduz superfície de configuração para usuários.
- **Upstream conflict risk**: médio em frontend.
- **Dependencies**: PR 03.
- **Rollback**: reverter UI.

## PR 05 - domain/organization

- **Objective**: entidade Organization + relações mínimas.
- **Scope**: migration Prisma `organizations`, `users.organization_id`, `workspaces.organization_id`, model `Organization`, endpoints de admin.
- **Modules/files**: `server/prisma/schema.prisma`, nova migration, `server/models/organization.js`, `server/endpoints/api/organization/index.js` ou similar, seed de empresa.
- **Architecture impact**: introduce org abstraction; core continua usando workspace.
- **Contract changes**: novos endpoints `/api/organization/*` (admin), settings de org.
- **Acceptance criteria**: criar/ler/atualizar empresa; seed `company-a`; migration up/down; workspaces associados.
- **Tests**: model/endpoint tests, migration rollback.
- **Observability added**: `organization_id` em logs de endpoints.
- **Security**: base para isolamento lógico futuro.
- **Upstream conflict risk**: médio em schema Prisma.
- **Dependencies**: PR 04.
- **Rollback**: migration reversível; feature flag.

## PR 06 - onboarding/company-setup

- **Objective**: onboarding orientado a negócio.
- **Scope**: fluxo segmento -> objetivo -> conhecimento -> comportamento -> testar -> publicar; cria Organization/workspace defaults.
- **Modules/files**: `frontend/src/pages/OnboardingFlow`, `frontend/src/models/organization.js`, `server/endpoints/api/onboarding` (a criar), `server/models/organization.js`.
- **Architecture impact**: product layer sobre setup existente.
- **Contract changes**: novos endpoints de onboarding/company setup.
- **Acceptance criteria**: empresa cria nome/segmento/objetivo; knowledge base inicial criada; sem configuração técnica obrigatória.
- **Tests**: e2e onboarding, unit de criação de org/workspace.
- **Observability added**: `organization.created`, `onboarding.completed` events internos.
- **Security**: validação de input, sem survey externa.
- **Upstream conflict risk**: alto no frontend onboarding.
- **Dependencies**: PR 05.
- **Rollback**: flag de onboarding; fluxo antigo opcional.

## PR 07 - rag/config-layer

- **Objective**: camada controlada de RAG config + fallback auditável.
- **Scope**: `Organization.ragConfig`, aplicar em `streamChatWithWorkspace`/`apiChatHandler`/`embed`, fallback `dont_know|human_handoff|general_llm`, metrics.
- **Modules/files**: `server/models/organization.js`, `server/utils/chats/stream.js`, `server/utils/chats/apiChatHandler.js`, `server/utils/chats/embed.js`, `server/endpoints/api/workspace/index.js`, frontend workspace settings.
- **Architecture impact**: extrai defaults de `workspaces` para `Organization.ragConfig` com override por workspace.
- **Contract changes**: API settings de ragConfig.
- **Acceptance criteria**: config controlada altera topN/threshold/citations/fallback; fallback logado; client não vê knobs.
- **Tests**: unit RAG config resolution, fallback cases.
- **Observability added**: `rag_fallback_total`, `rag_fallback_type`, logs de fallback.
- **Security**: impede mudança arbitrária pelo cliente.
- **Upstream conflict risk**: médio em chat utils.
- **Dependencies**: PR 05/06.
- **Rollback**: default config sem mudanças de schema.

## PR 08 - integrations/n8n-tools

- **Objective**: tools explícitas consultor.IA -> n8n.
- **Scope**: allowlist por org, HMAC, idempotency, timeout, tools `scheduleAppointment`, `getAvailableSlots`, `createLead`, `findCustomer`, `getOrderStatus`, `requestHumanSupport`; restringir agent flow API call.
- **Modules/files**: `server/utils/integrations/n8n/*` (novo), `server/models/organization.js`, `server/utils/agents/defaults.js`, `server/utils/agents/aibitat/plugins/n8n/*` (novo), `server/endpoints/api/integrations/*`, frontend settings.
- **Architecture impact**: integration layer; n8n nunca é chamado por URL arbitrária.
- **Contract changes**: contrato `08-integration-contracts.md`.
- **Acceptance criteria**: tool schema fixo; assinatura validada; retry/idempotency; rate limit; sem HTTP arbitrário.
- **Tests**: unit/contract tests com n8n mock.
- **Observability added**: `n8n_*` metrics e spans.
- **Security**: SSRF/tool abuse mitigado.
- **Upstream conflict risk**: baixo (novos arquivos).
- **Dependencies**: PR 05/06.
- **Rollback**: feature flag; tools desabilitadas.

## PR 09 - observability/ai-tracing

- **Objective**: tracing de RAG/LLM/agent e sensitive debug mode.
- **Scope**: spans de embedding/qdrant/rag/llm/agent/n8n, metrics LLM/RAG/agent, debug mode, cost tracking.
- **Modules/files**: `server/utils/observability/*`, `server/utils/chats/*`, `server/utils/agents/*`, `server/utils/vectorDbProviders/*`, `server/utils/EmbeddingEngines/*`, `server/utils/helpers/chat/*`.
- **Architecture impact**: instrumentação profunda sem mudança de comportamento.
- **Contract changes**: campos `trace_id`/`conversation_id` nos outputs internos e logs.
- **Acceptance criteria**: cenário "Empresa B lenta às 15:32" reproduzível no Tempo/Grafana; metrics aparecem; debug mode desligado por default.
- **Tests**: span assertions com OTel mock, metrics unit.
- **Observability added**: spans AI e metrics completas.
- **Security**: redação e debug mode restrito.
- **Upstream conflict risk**: médio em chat/agent utils; usar wrapper.
- **Dependencies**: PR 02.
- **Rollback**: flag `OTEL_AI_TRACING_ENABLED`.

## PR 10 - feedback/message-rating

- **Objective**: feedback 👍/👎 com razão e correlação.
- **Scope**: estender `workspace_chats.feedbackScore` com reason/created_at, API, UI, metrics.
- **Modules/files**: `server/prisma/schema.prisma`, migration, `server/models/workspaceChats.js`, `server/endpoints/workspaces.js`, `frontend/src/components/WorkspaceChat/.../Actions`, `frontend/src/models/workspace.js`.
- **Architecture impact**: product analytics.
- **Contract changes**: payload feedback com `score` + `reason`.
- **Acceptance criteria**: feedback positivo/negativo; razão obrigatória em negativo; associado a message/conversation/trace.
- **Tests**: API/model tests, UI e2e.
- **Observability added**: `feedback_positive_rate`, `feedback_negative_rate`, log com `conversation_id`.
- **Security**: sem dados sensíveis.
- **Upstream conflict risk**: baixo.
- **Dependencies**: PR 09 (correlação).
- **Rollback**: colunas nullable.

## PR 11 - rag/evaluation-suite

- **Objective**: avaliar RAG por empresa.
- **Scope**: datasets, runs, metrics: retrieval accuracy, answer correctness, citation correctness, no-answer correctness, hallucination rate, latency, cost.
- **Modules/files**: novas models `evaluation_datasets`, `evaluation_runs`, `evaluation_results`, CLI/script de eval, docs.
- **Architecture impact**: tooling/analytics, não runtime principal.
- **Contract changes**: schema interno de evaluation.
- **Acceptance criteria**: dataset A/B roda; relatório compara configs; sem alterar chat runtime.
- **Tests**: eval harness com fixtures.
- **Observability added**: metrics de eval separadas.
- **Security**: datasets podem conter conteúdo da empresa; isolar por deployment.
- **Upstream conflict risk**: baixo.
- **Dependencies**: PR 07/09.
- **Rollback**: feature isolada.

## PR 12 - analytics/company-dashboard

- **Objective**: dashboard por empresa (Grafana + API).
- **Scope**: queries/metrics aggregation, dashboards, API `/analytics/company`.
- **Modules/files**: `server/endpoints/api/analytics/*`, `infra/grafana/dashboards/*`, frontend dashboard (admin).
- **Architecture impact**: camada analytics sobre OTel/DB.
- **Contract changes**: contrato de analytics.
- **Acceptance criteria**: mostra availability, requests, latency, LLM errors, fallback, tokens, cost, feedback por empresa.
- **Tests**: aggregation unit.
- **Observability added**: dashboards e métricas agregadas.
- **Security**: RBAC admin; org filters.
- **Upstream conflict risk**: baixo.
- **Dependencies**: PR 09/10/11.
- **Rollback**: endpoint flag.

## PR 13 - privacy/network-ci-gate

- **Objective**: impedir reintrodução de telemetria/outbound desconhecido.
- **Scope**: CI jobs de forbidden SDK/domain/import, network allowlist test, docs runbook.
- **Modules/files**: `.github/workflows/privacy-gate.yaml`, `extras/scripts/privacy-allowlist.js` (novo), `docs/architecture/02-zero-telemetry-audit.md`.
- **Architecture impact**: governance.
- **Contract changes**: nenhum.
- **Acceptance criteria**: PR com `posthog`/`anythingllm.com`/novo domínio fora da allowlist falha; rede test passa para workflows críticos.
- **Tests**: script com fixtures.
- **Observability added**: audit event `privacy_gate`.
- **Security**: gate obrigatório.
- **Upstream conflict risk**: baixo.
- **Dependencies**: PR 01; pode começar em paralelo.
- **Rollback**: desabilitar job, não afeta runtime.
