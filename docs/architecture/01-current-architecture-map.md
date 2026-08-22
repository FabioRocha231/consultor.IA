# 01 - Current Architecture Map

Fonte principal: fork em `master` (`72aabbd1`, AnythingLLM v1.16.0), submodulos `embed` e `browser-extension` não inicializados no checkout.

## Componentes atuais

| Component | Decision | Reason | Evidence |
| --- | --- | --- | --- |
| Chat Engine (streaming SSE) | KEEP | Já implementa streaming, abort no disconnect, RAG e agent routing | `server/endpoints/chat.js:22`, `server/utils/chats/stream.js:24` |
| RAG Engine (similarity search) | KEEP + EXTEND | `performSimilaritySearch`, topN, threshold e rerank nativo já existem; falta camada de produto/quality | `server/utils/chats/stream.js:187`, `server/utils/vectorDbProviders/base.js:122` |
| Qdrant Adapter | KEEP | Client REST, collections por workspace, cosine, threshold e upsert prontos | `server/utils/vectorDbProviders/qdrant/index.js:20`, `server/utils/vectorDbProviders/qdrant/index.js:117` |
| Document Engine / Collector | KEEP | Parsing de PDF, DOCX, links, OCR, Whisper e extensões já existem | `collector/processSingleFile/index.js`, `collector/processLink/index.js`, `server/utils/collectorApi/index.js:121` |
| Embeddings (providers + nativo) | KEEP | Native ONNX + OpenAI-compatibles + providers; fallback CDN precisa auditoria | `server/utils/EmbeddingEngines/native/index.js:25`, `server/utils/EmbeddingEngines/native/index.js:37` |
| LLM Providers | KEEP | Multi-provider e model router existem | `server/utils/AiProviders`, `server/utils/agents/aibitat/providers`, `server/endpoints/modelRouter.js` |
| Agent Runtime (Aibitat) | KEEP + WRAP | Runtime completo, mas tools precisam allowlist/contratos | `server/utils/agents/index.js`, `server/utils/agents/aibitat/index.js` |
| Agent Tools | HIDE + RESTRICT | Web search, web scraping, filesystem, Gmail/Calendar/Outlook, SQL e agent flows podem causar SSRF/tool abuse | `server/utils/agents/defaults.js:15`, `server/utils/agents/aibitat/plugins/web-browsing.js`, `server/utils/agents/aibitat/plugins/web-scraping.js`, `server/utils/agentFlows/executors/api-call.js:42` |
| API HTTP (Express + WS) | KEEP | Endpoints de app e developer API prontos | `server/index.js:63`, `server/endpoints/api/index.js` |
| Auth / Users / Roles | KEEP + EXTEND | JWT, single-user, multi-user, roles admin/manager/default, API keys | `server/utils/middleware/validatedRequest.js:74`, `server/models/user.js:26`, `server/utils/middleware/multiUserProtected.js:8` |
| Workspaces | KEEP + WRAP | Já é o container de conhecimento, RAG e chat; será associado a Organization | `server/prisma/schema.prisma:114`, `server/models/workspace.js:16` |
| Threads | KEEP | Histórico por thread | `server/prisma/schema.prisma:144`, `server/models/workspaceThread.js` |
| Documents | KEEP | Upload, workspace_documents, parsed files e embeds | `server/prisma/schema.prisma:16`, `server/models/documents.js`, `server/models/workspaceParsedFiles.js` |
| Vector DB | REPLACE (padrão) | Default é LanceDB; alvo é Qdrant por empresa | `server/.env.example:304`, `server/utils/vectorDbProviders/lance/index.js` |
| DB / Migrations | KEEP + EVOLVE | SQLite default, Postgres comentado; alvo: Postgres por empresa | `server/prisma/schema.prisma:12`, `server/prisma/migrations/` |
| Settings / Env vars | KEEP + WRAP | `system_settings` + env vars são a base de config existente | `server/models/systemSettings.js:1`, `server/utils/helpers/updateENV.js:570` |
| Branding UI | KEEP + REPLACE assets | Já existe custom app name, logo, favicon e meta | `frontend/src/pages/GeneralSettings/Settings/Branding/index.jsx`, `server/utils/boot/MetaGenerator.js:84` |
| Technical Settings UI | HIDE | Cliente não deve ver LLM/embedding/vector/temperature/chunking | `frontend/src/components/SettingsSidebar/index.jsx:118` |
| Onboarding | REPLACE | Onboarding atual pede survey externa e tech preference | `frontend/src/pages/OnboardingFlow/Steps/Survey/index.jsx:27`, `frontend/src/main.jsx:338` |
| Telemetry PostHog | REMOVE | Envia eventos por padrão para PostHog | `server/models/telemetry.js:13`, `server/models/telemetry.js:51`, `server/package.json:88` |
| Community Hub | REMOVE ou DISABLE | Feature opcional com tráfego externo para hub AnythingLLM | `server/models/communityHub.js:11`, `frontend/src/utils/paths.js:215` |
| n8n Integration | ADD | Não existe hoje | `rg 'n8n' server frontend/src` sem hits de implementação |
| Organization Domain | ADD | Não existe entidade organization | `server/prisma/schema.prisma` (sem model organization) |
| Observability | ADD | Logs hoje são console/winston não estruturados; não há OTel | `server/utils/logger/index.js:12`, `server/middleware/httpLogger.js:3` |
| Analytics de produto | ADD | `event_logs` guarda eventos simples, sem métricas/custos/dashboards | `server/prisma/schema.prisma:280`, `server/models/eventLogs.js:7` |
| Feedback | KEEP + EXTEND | FeedbackScore booleano já existe, sem motivo/categorias | `server/prisma/schema.prisma:193`, `server/endpoints/workspaces.js:538` |
| Backups / Restore | ADD | Não há estratégia de backup documentada no repo | `docker/docker-compose.yml` (apenas volume local) |

## Fluxo de request atual (alto nível)

1. Frontend React (Vite) chama `/api` (SSE para chat, REST para demais).
2. `server/index.js` monta routers Express/WS.
3. `validatedRequest` valida JWT ou API key (`server/utils/middleware/validatedRequest.js:7`).
4. Chat: `streamChatWithWorkspace` resolve provider, carrega histórico, faz RAG (`performSimilaritySearch`), monta prompt e streama (`server/utils/chats/stream.js:24`).
5. Agent: `grepAgents` decide automatic/agent; runtime Aibitat chama tools e websocket (`server/utils/chats/agents.js:51`, `server/endpoints/agentWebsocket.js:27`).
6. Documentos: upload -> Collector `/process` -> parsed JSON -> embed worker -> Qdrant/LanceDB (`server/endpoints/api/document/index.js:120`, `server/jobs/embedding-worker.js:60`).

## API e integrações já expostas

- Developer API OpenAI-compatible: `server/endpoints/api/openai/index.js`, `server/endpoints/api/index.js`.
- Embed widget: `server/endpoints/embed/index.js`, `server/endpoints/embedManagement.js`.
- Browser extension: `server/endpoints/browserExtension.js`.
- Telegram: `server/endpoints/telegram.js`.
- MCP servers: `server/endpoints/mcpServers.js`.
- Web push, mobile, scheduled jobs: `server/endpoints/webPush.js`, `server/endpoints/mobile/index.js`, `server/endpoints/scheduledJobs.js`.

## Resumo de decisão

- **KEEP**: core de IA, RAG, documentos, agent runtime, providers, API, auth, threads, feedback base.
- **KEEP + EXTEND/WRAP**: workspaces, RAG config, agent tools, settings, eventos internos.
- **HIDE**: UI técnica e tools perigosas.
- **REPLACE**: default vector DB para Qdrant, onboarding, branding.
- **REMOVE**: telemetria externa.
- **ADD**: Organization, n8n, observability, analytics, dashboards, privacy CI.
