# 08 - Integration Contracts

Contratos TypeScript conceituais. Devem virar schemas reais no código em `server/` e `frontend/src/` quando os PRs forem implementados.

## consultor.IA <-> n8n

Filosofia: consultor.IA chama webhooks n8n via tools explícitas e allowlist. n8n nunca é invocado com URL arbitrária de agente. Cada organização tem `INTEGRATION_ALLOWLIST` (webhooks permitidos).

### Auth e assinatura

- Cada webhook n8n tem secret por organização: `N8N_WEBHOOK_SECRET_<slug>`.
- Request inclui header `X-Consultor-Signature: sha256=<hex>` sobre `body + timestamp + idempotency_key`.
- n8n verifica assinatura; consultor.IA verifica resposta apenas dentro de timeout.
- TLS obrigatório; sem HTTP em produção.

### Payload request

```typescript
interface N8nToolRequest {
  tool: "scheduleAppointment" | "getAvailableSlots" | "createLead"
      | "findCustomer" | "getOrderStatus" | "requestHumanSupport";
  organization_id: string;
  correlation_id: string;      // trace_id/request_id derivado
  idempotency_key: string;     // UUID por tentativa lógica
  timestamp: string;           // ISO 8601
  params: Record<string, unknown>;
}
```

### Payload response

```typescript
interface N8nToolResponse {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
  correlation_id: string;
}
```

### Policy

| Item | Valor |
| --- | --- |
| Timeout | 10s default (configurável por tool) |
| Retry | 2 tentativas para idempotentes; sem retry automático para não-idempotentes |
| Idempotency | `idempotency_key` obrigatória; n8n deve deduplicar |
| Rate limit | por organização/tool: default 10 req/min |
| Allowlist | `organization.integrations.n8nWebhookAllowlist` |
| Logging | IDs e status; payload completo proibido por padrão |
| Tracing | propagar `traceparent` quando possível; `correlation_id` sempre |

### Tool naming

Registrar no agente apenas tools com schema fixo (ex.: `n8n.scheduleAppointment`), não `n8n.callArbitraryUrl`.

## consultor.IA <-> Qdrant

Reuso do adapter existente (`server/utils/vectorDbProviders/qdrant/index.js`).

```typescript
interface QdrantSearchRequest {
  namespace: string;              // workspace.slug
  vector: number[];
  limit: number;                  // topN
  score_threshold: number;        // similarityThreshold
  with_payload: true;
}

interface QdrantSearchResponse {
  id: string;
  score: number;
  payload: {
    text: string;
    docId: string;
    title?: string;
    chunkSource?: string;
    [key: string]: unknown;
  };
}
```

- Endpoint/API key por deployment (`QDRANT_ENDPOINT`, `QDRANT_API_KEY`).
- Collection per workspace; nunca buscar fora do namespace.
- Dimensões e distância: inferidas no adapter (`getOrCreateCollection`), alvo fixo `Cosine`.
- Timeout e retry: definir no client (alvo 5s / 1 retry para read).
- Observability: spans `qdrant.search`, `qdrant.upsert` e metrics `qdrant_*`.

## consultor.IA <-> LLM Provider

- Usar connectors existentes (`server/utils/AiProviders/*`, `server/utils/agents/aibitat/providers/*`) e OpenAI-compatible API onde possível.
- Response metrics já existem em `stream.metrics` e `addChatCostToMetrics` (`server/utils/helpers/modelPricing/index.js:331`).
- Contrato: não expor chaves ao frontend; server-only (`server/utils/helpers/updateENV.js`).
- Correlacionar com `trace_id`, `conversation_id`, `organization_id`, `model`, `provider`.
- Timeout: SDKs já têm patch em `server/utils/boot/patchSdkTimeouts.js:73`.

```typescript
interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  model: string;
  provider: string;
  time_to_first_token_ms?: number;
  duration_ms?: number;
  cost_usd?: number;
}
```

## consultor.IA <-> OTel Collector

- Protocolo: OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`), default `http://alloy:4317`.
- Resource attributes obrigatórios: `service.name`, `deployment.environment`, `organization.id`, `deployment.id`.
- Traces: `trace_id`, `span_id`, `request_id`, `conversation_id`, `organization_id`.
- Metrics: OTLP metrics; labels de baixa cardinalidade.
- Logs: structured JSON; OTel logs ou via Loki push pelo Alloy.
- Auth: network internal; se remote, mTLS ou token `OTEL_EXPORTER_OTLP_HEADERS`.

```typescript
interface OtelResource {
  "service.name": "consultor-ia" | "collector" | "alloy";
  "deployment.environment": "staging" | "production";
  "organization.id": string;
  "deployment.id": string;
}
```

## Correlation contract

Toda request externa carrega:

- `trace_id` (OTel)
- `span_id` (span atual)
- `request_id` (HTTP/application)
- `conversation_id` (chat/thread)
- `organization_id` (empresa)
- `idempotency_key` (somente mutações/integrações)

Esses campos são propagados para logs e n8n; nunca para provider de LLM sem necessidade justificada.
