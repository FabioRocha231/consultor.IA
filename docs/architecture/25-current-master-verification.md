# 25 - Current Master Verification (post-MVP)

Verificação do estado real do `master` (commit `dd09c4cd`) contra os claims do handoff pós-MVP.

Data: 2026-08-23. Branch: `master`. Working tree: apenas `HANDOFF.md` (handoff da fase MVP, não commitado).

## Componentes verificados

| Componente | Onde está | Estado | Evidência |
| --- | --- | --- | --- |
| Privacy CI Gate | `.github/workflows/privacy-gate.yaml`, `server/scripts/privacy-scan.mjs`, `server/scripts/privacy-{allowlist,forbidden}.json` | OK | Workflows: `static-privacy-check`, `network-privacy-check`, `dependency-audit` (este último `continue-on-error`). |
| OpenTelemetry | `server/utils/observability/{index,tracing,metrics,ai,integrations}.js` | OK | Boot condicional em `process.env.OTEL_SDK_DISABLED !== "true"`. |
| PostgreSQL | `server/prisma/schema.prisma` | OK | `datasource db { provider = "postgresql"; url = env("DB_URL") }`. Baseline única em `server/prisma/migrations/20260823104834_baseline/`. |
| Organization | `server/models/organization.js` + tabela `organizations` | OK | `Organization.count()` + `ensureDefaultOrganization()` no boot. |
| Qdrant isolation | `server/utils/vectorDbProviders/qdrant/*` | OK | ADR-004. Coleções por workspace. |
| n8n integration | `server/integrations/n8n/{client,contract,tools/*}.js` | OK | HMAC, idempotency, retry, tools `createLead`, `requestHumanSupport`. Migration `20260823120000_add_organization_n8n_config`. |
| RAG config | `server/models/organization.js` (campo `ragConfig`), `server/endpoints/ragConfig.js` | OK | Resolver hierárquico org > workspace > default, fallback configurável. |
| Feedback | `server/models/workspaceChats.js`, `server/endpoints/feedback.js` | OK | Categoria + comentário em `👎`. |
| Dashboard | `server/endpoints/dashboard.js`, frontend `frontend/src/pages/Dashboard/` | OK | Agregação feedback + cost + latência. |
| RAG Evaluation | `server/models/evalDataset.js`, `server/models/evalRun.js`, `server/endpoints/eval.js`, `frontend/src/pages/Evaluation/` | OK (mock) | Runner determinístico. `EVAL_LIVE` ainda não implementado. |
| Branding consultor.IA | Frontend, MetaGenerator (parcial) | OK com pendência | `MetaGenerator.js` ainda aponta `https://anythingllm.com` em og:url/twitter:url — corrigir no PR 16 (docs/identidade). |

## Componentes NÃO verificados (precisam de auditoria dedicada)

| Componente | Estado | Documento de auditoria |
| --- | --- | --- |
| `embed/` | Não auditado em runtime | Será produzido em `docs/architecture/22-embed-audit.md` (worker em andamento). |
| `browser-extension/` | Não auditado | Será produzido em `docs/architecture/23-browser-extension-audit.md` (worker em andamento). |

## Gaps confirmados por inspeção direta

Estes são os gaps que conseguimos afirmar lendo o código, sem esperar pelos workers:

1. **`workspace_chats.traceId` não existe** no schema. `grep -n traceId server/prisma/schema.prisma` retorna vazio. GAP 05 do handoff CONFIRMADO.
2. **Sem mecanismo de backup/restore**: `find server docker infra -name '*backup*' -o -name '*restore*'` retorna apenas arquivos do `node_modules/`. Sem script, sem cron, sem volume definition. GAP 06 CONFIRMADO.
3. **Sem rate limiting middleware**: `rg -l 'rate.?limit|rateLimit|throttle' server/` retorna apenas referências em providers/observability, nenhum middleware de Express. GAP 11 CONFIRMADO.
4. **Sem admin bootstrap**: `rg -ln 'ADMIN_EMAIL|ADMIN_PASSWORD'` retorna apenas `.env.example` e `package.json`. Não há seed script nem endpoint que cria primeiro admin a partir de env vars. GAP 10 CONFIRMADO.
5. **Pricing local é estático** (`server/utils/helpers/modelPricing/pricing.json`): bom. Mas verificar se há chamada remota em algum path (delegado para `24-runtime-egress-map.md`).
6. **MetaGenerator ainda referencia AnythingLLM**: `server/utils/boot/MetaGenerator.js:84` e `:116` colocam `https://anythingllm.com` no og:url e twitter:url. Não bloqueia runtime, mas é inconsistência de branding — vai no PR 16.

## Próximos passos

- Aguardar workers `22-embed-audit`, `23-browser-extension-audit`, `24-runtime-egress-map` para fechar o quadro completo de gaps.
- Com base nisso, escrever `26-production-readiness-gap-analysis.md` consolidado.
- Definir `27-revised-pr-roadmap.md` com ordem recomendada.
- Detalhar `28-first-pr-plan.md` para `privacy/runtime-egress-audit` (PR 14).
