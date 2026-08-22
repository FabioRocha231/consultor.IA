# 06 - Data Flows

## Chat Flow

```mermaid
sequenceDiagram
  participant U as Usuario
  participant FE as Frontend
  participant API as Server API
  participant LLM as LLM Provider
  participant DB as Chat DB
  U->>FE: envia mensagem
  FE->>API: POST /api/workspace/:slug/stream-chat (SSE)
  API->>API: auth + workspace
  API->>DB: carrega histórico
  API->>API: resolve provider/modelo
  API-->>FE: stream de chunks
  API->>LLM: gera resposta
  API->>DB: salva workspace_chats
  API-->>FE: end
```

Evidência: `server/endpoints/chat.js:22`, `server/utils/chats/stream.js:24`, `server/models/workspaceChats.js:10`.

## RAG Flow

```mermaid
sequenceDiagram
  participant API as Server
  participant EMB as Embedding Provider
  participant QD as Qdrant
  participant LLM as LLM
  API->>API: verifica namespace/embeddings
  API->>EMB: gera embedding da pergunta
  EMB-->>API: vector
  API->>QD: search(namespace, topN, threshold)
  QD-->>API: chunks + scores
  API->>API: filtra threshold, dedupe, fill source window
  API->>LLM: prompt com contexto
  LLM-->>API: resposta
```

Evidência: `server/utils/chats/stream.js:187`, `server/utils/vectorDbProviders/qdrant/index.js:117`, `server/utils/vectorDbProviders/base.js:122`.

## Agent Flow

```mermaid
sequenceDiagram
  participant U as Usuario
  participant FE as Frontend
  participant WS as Agent WebSocket
  participant AG as Aibitat Agent
  participant TOOL as Tools
  AG->>AG: decide agent chat (automatic mode)
  WS->>AG: invocação de agent
  loop tool calls
    AG->>AG: reasoning
    AG->>TOOL: executa tool
    TOOL-->>AG: resultado estruturado
  end
  AG->>AG: resposta final
  WS-->>FE: output + thoughts + citations
```

Evidência: `server/utils/chats/agents.js:51`, `server/utils/agents/index.js:54`, `server/endpoints/agentWebsocket.js:27`.

## Tool Flow

- Agent recebe tool list via `WORKSPACE_AGENT.getDefinition()` (`server/utils/agents/defaults.js:56`).
- Tools default: memory, doc-summarizer, web-scraping (`server/utils/agents/defaults.js:15`).
- Whitelist/approval: `server/endpoints/agentSkillWhitelist.js`, `server/models/agentSkillWhitelist.js`, `server/utils/agents/imported.js:178`.
- Tool perigoso: `api-call` de agent flows faz `fetch(url)` arbitrário (`server/utils/agentFlows/executors/api-call.js:42`). Alvo: restringir a allowlist/assinatura.
- Search tools: web-browsing chama SerpAPI/SearchAPI/Tavily etc conforme env (`server/utils/agents/aibitat/plugins/web-browsing.js:96`).

## n8n Flow (alvo)

```mermaid
sequenceDiagram
  participant U as Usuario
  participant LLM as Agent LLM
  participant TOOL as consultor.IA Tool
  participant N8N as n8n Webhook
  participant EXT as CRM/Agenda/ERP
  U->>LLM: "marcar para terça"
  LLM->>TOOL: scheduleAppointment(...)
  TOOL->>N8N: POST webhook (signed, correlation_id, idempotency_key)
  N8N->>EXT: integração
  EXT-->>N8N: resultado
  N8N-->>TOOL: structured result
  TOOL-->>LLM: structured result
  LLM-->>U: resposta
```

Contrato detalhado em `08-integration-contracts.md`.

## Document Ingestion Flow

1. Usuário envia arquivo/link no frontend (`frontend/src/components/Modals/ManageWorkspace/Documents/UploadFile/index.jsx`).
2. Server recebe upload e chama Collector (`server/endpoints/api/document/index.js:120`, `server/utils/collectorApi/index.js:121`).
3. Collector verifica integridade (`collector/middleware/verifyIntegrity.js:9`), processa (`collector/processSingleFile/index.js`, `collector/processLink/index.js`) e retorna parsed documents.
4. Documento é salvo/embedido em workspace (`server/models/documents.js`, `server/jobs/embedding-worker.js:60`).
5. Embeddings: `server/utils/EmbeddingEngines/*`; vector write: `server/utils/vectorDbProviders/qdrant/index.js:196`.
6. Observability: `document_ingestion_*` metrics + trace `document.ingest` (alvo).

## Observability Flow

```mermaid
sequenceDiagram
  participant APP as consultor.IA app
  participant OTel as OTel SDK
  participant ALLOY as Grafana Alloy
  participant BACK as Prometheus/Loki/Tempo
  participant GRAF as Grafana
  APP->>OTel: trace spans + metrics + structured logs
  OTel-->>ALLOY: OTLP
  ALLOY-->>BACK: roteamento por type/label
  BACK-->>GRAF: queries
  GRAF-->>OPER: dashboards e alertas
```

Evidência atual: não há OTel; logs atuais em `server/utils/logger/index.js`, `server/middleware/httpLogger.js`, `server/models/eventLogs.js`.

## Feedback Flow

1. Frontend tem thumbs up/down (`frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/index.jsx:55`).
2. API grava `feedbackScore` em `workspace_chats` (`server/endpoints/workspaces.js:538`, `server/models/workspaceChats.js:266`).
3. Schema atual: booleano (`server/prisma/schema.prisma:193`).
4. Alvo PR 10: adicionar `reason`/categorias e correlacionar com trace/conversation/model/RAG config.
