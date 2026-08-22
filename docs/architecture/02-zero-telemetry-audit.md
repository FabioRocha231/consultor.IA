# 02 - Zero Telemetry Audit

Escopo: `server/`, `frontend/`, `collector/`, `docker/`, `package.json`, `embed/` (submodulo não inicializado neste checkout), `browser-extension/` (submodulo não inicializado neste checkout), build/CI, startup, jobs e env.

Método: busca por SDKs/domínios de analytics + revisão de chamadas `fetch`/outbound relevantes. Não foi feito teste de rede empírico neste ciclo; ele está planejado no PR 13.

## Achados de telemetria/analytics

| # | Component | Achado | Destino externo inferido | Dado enviado | Decision |
| --- | --- | --- | --- | --- | --- |
| T1 | server telemetry core | `posthog-node` + `Telemetry.sendTelemetry`; pubkey PostHog fixa; `telemetry_id` UUID criado e salvo em `system_settings` | `us.i.posthog.com`/PostHog | eventos de uso (chat, upload, workspace, login, boot), runtime, provider/model, ID anônimo | **REMOVE** |
| T2 | server boot | `setupTelemetry()` envia `server_boot` | PostHog | commit e runtime | **REMOVE** |
| T3 | server settings | `DisableTelemetry` default `"false"` e UI Privacy | PostHog | telemetria permanece ligada por padrão | **REMOVE** |
| T4 | frontend onboarding | survey envia `email`, `useCase`, `comment` via `fetch`/`sendBeacon` para `onboarding.anythingllm.com` | Mintplex | PII do usuário | **REMOVE** |
| T5 | Community Hub | modelo consulta `hub.external.anythingllm.com/v1` e frontend linka `hub.anythingllm.com` | Mintplex | lista de items, itens importados, connection key em requests autenticados | **REMOVE ou DISABLE** |
| T6 | model pricing | `ModelPricing` baixa `models.dev/api.json` no boot se cache estiver velho | models.dev | requisição com ETag; sem dados do cliente | **INVESTIGATE -> ALLOW se mantivermos custo estimado, ou REMOVE/self-host** |
| T7 | native embeddings/reranker | fallback para `cdn.anythingllm.com/support/models/` quando modelo não está em cache | Mintplex CDN | download de modelo (binário de modelo) | **INVESTIGATE -> ALLOW com allowlist ou REMOVE fallback** |
| T8 | HuggingFace | `@xenova/transformers` baixa modelos de `hf.co`/`huggingface.co` se ausentes | HuggingFace | download de modelo | **ALLOW (funcional), configurável** |
| T9 | outbound funcional | LLM, embeddings, search providers, vector DB, collector, web scraping, agent flows | dependente de config | conteúdo/config autorizado pelo deploy | **ALLOW com allowlist** |
| T10 | README/terms/locales | descrevem telemetria PostHog e `DISABLE_TELEMETRY` | - | documentação | **REPLACE** |
| T11 | build/CI | workflows não checam telemetria nem outbound | - | - | **ADD privacy CI gate (PR 13)** |
| T12 | prisma/docker | `docker-entrypoint.sh` desativa telemetria Prisma CLI; helm default `DISABLE_TELEMETRY=true` | Prisma | telemetria CLI (não aplicação) | **ALLOW (já neutralizado) / KEEP** |
| T13 | lockfiles | `posthog-node` presente no `server/yarn.lock` | PostHog | - | **REMOVE no PR 01** |
| T14 | embed/browser-extension | Vendored em 2026-08-22 (submodule absorb, ADR-010); 88 arquivos, ~644 KB | - | - | **AUDITAR no PR 13 ou PR dedicado (privacy scan completo)** |

## Dependency audit

| Dependency | Purpose | Sends external data? | Required? | Decision |
| --- | --- | --- | --- | --- |
| `posthog-node` (`server/package.json:88`) | telemetria de uso | SIM, quando `DISABLE_TELEMETRY != true` | NÃO | **REMOVE** |
| `@xenova/transformers` | embeddings/reranker local | SIM, download de modelos se não em cache | SIM (funcional) | KEEP; allowlist |
| `puppeteer` | scraping | SIM, para sites alvo | SIM | KEEP; controlado |
| `@qdrant/js-client-rest` | Qdrant | SIM, para Qdrant configurado | SIM | KEEP |
| providers SDKs (openai, anthropic, etc.) | LLM/embeddings | SIM, para providers configurados | SIM | KEEP |
| `winston` | logs locais | NÃO | SIM | KEEP (será substituído por OTel/structured) |

## Option A vs Option B

### Option A - Physical Removal

Remover `posthog-node`, `server/models/telemetry.js`, `server/utils/telemetry/index.js`, todas as chamadas `Telemetry.*`, `telemetry_id`, UI Privacy, `DisableTelemetry` e survey/community hub.

- Privacidade: garantia estrutural; impossível habilitar acidentalmente.
- Risco de regressão: médio, porque são muitos call sites, mas testes existentes cobrem alguns (`server/__tests__/utils/chats/apiChatHandler.test.js:32` mocks telemetry).
- Conflito upstream: alto no diff, mas concentrado em PRs pequenos e com sync/review.
- Manutenção: baixa depois de remover; menos código e menos config.
- Auditoria: simples e auditável por CI de domínios/SDKs.

### Option B - NoOpTelemetry adapter

Manter interface `Telemetry` e trocar implementação para no-op.

- Privacidade: depende de não haver vazamento na implementação/regressão.
- Risco de regressão: menor no diff, mas mantém dead code, dependência potencial e risco de upstream reativar.
- Conflito upstream: menor no diff.
- Manutenção: mantém código que não serve ao produto e `telemetry_id`.
- Auditoria: mais difícil justificar "zero" quando o código de telemetria permanece.

### Recomendação

**Option A (remoção física)** para telemetria PostHog e survey/community hub. Para `models.dev` e CDN de modelos, decidir por allowlist explícita (ver `08-integration-contracts.md` e PR 01/PR 13).

## Allowed outbound traffic (proposta inicial)

| Destino | Motivo | Condição |
| --- | --- | --- |
| LLM provider configurado | chat/agents | explicitamente configurado |
| Embedding provider configurado | RAG/embedding | explicitamente configurado |
| Qdrant | vector search/storage | explicitamente configurado |
| Collector local | document processing | local/network interno |
| n8n | integration layer | allowlist por empresa |
| Business APIs aprovadas | tools/agentes | allowlist e assinatura |
| Model hosting (HF ou mirror autorizado) | modelo local em primeiro uso | allowlist; preferir pré-baixar na imagem |

## Remaining privacy risks

1. `HYPOTHESIS:` dependências transitivas podem conter calls de telemetria não encontradas por busca textual; requer lockfile/network audit empírico.
2. `HYPOTHESIS:` `models.dev` refresh em boot é outbound automático; se custo estimado não for crítico, pode ser removido no PR 01 para ficar com allowlist menor.
3. `HYPOTHESIS:` atualização futura do upstream pode reintroduzir telemetria; mitigado pelo PR 13 (CI gate).
4. `HYPOTHESIS:` n8n e agents podem gerar outbound arbitrário; exige allowlist, assinatura e bloqueio de SSRF.
5. Embed/browser-extension submodulos não auditados neste checkout; obrigatório antes de release.
