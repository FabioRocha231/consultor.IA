# 07 - Data Model Changes

Princípio: reusar o modelo existente. Mudanças mínimas, apenas entidades realmente necessárias.

## O que já existe e será reusado

| Entity | Uso |
| --- | --- |
| `users` | usuários por empresa (1 deployment = usuários da empresa) |
| `workspaces` | assistente/base de conhecimento/RAG config por empresa |
| `workspace_chats` | histórico e feedback |
| `workspace_threads` | threads |
| `workspace_documents`, `document_vectors` | documentos e vetores |
| `system_settings` | config global e settings da empresa no MVP |
| `event_logs` | base para observability interna atual |
| `api_keys` | developer API |
| `model_routers`, `scheduled_jobs`, `memories` | features existentes |

## Mudanças mínimas

### 1. `organizations` (nova)

```prisma
model organizations {
  id          Int      @id @default(autoincrement())
  name        String
  slug        String   @unique
  segment     String   @default("other")
  status      String   @default("active")
  branding    String?  // JSON: app_name, logo, colors, meta
  aiConfig    String?  // JSON: provider, model, embedding defaults
  ragConfig   String?  // JSON: chunking, topK, threshold, fallback, citations
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  users       users[]
  workspaces  workspaces[]
  integrations String? // JSON: n8n webhook allowlist
}
```

### 2. Relações

- `users.organization_id Int?`
- `workspaces.organization_id Int?`
- Chaves estrangeiras opcionais para não quebrar deploy/upstream.
- SQLite: manter nullable para simplificar migration no MVP.

### 3. `workspace_chats` (feedback estendido - PR 10)

- `feedback_reason String?`
- `feedback_created_at DateTime?`
- `trace_id String?` (para diagnóstico)

### 4. `message_ratings`? - NÃO no MVP

Booleano + reason em `workspace_chats` é suficiente; tabela separada só quando forem necessários múltiplos ratings por mensagem.

### 5. Tabelas de evaluation - P1

- `evaluation_datasets`, `evaluation_runs`, `evaluation_results` são adicionadas no PR 11, não no MVP core.

### 6. Observability data

- **Não** criar tabelas para traces/metrics; usar Tempo/Prometheus/Loki.
- `event_logs` pode ser mantido como product event log, mas logs operacionais devem ir para OTel/Loki.

## Por que não multi-tenancy no MVP

- 3 empresas = 3 deployments; isolamento físico é mais simples e mais seguro que tenancy lógico.
- `organization_id` nas tabelas principais prepara evolução sem migrar schema inteiro depois.
- Não criar `tenant_id` em toda tabela agora; adicionar apenas em `users`, `workspaces` e entidades novas.

## Migration strategy

- Manter migrations Prisma incrementais (`server/prisma/migrations/`).
- Fazer migration por deployment (A/B/C) com rollback testado.
- Nunca rodar migration que combine dados entre empresas.
