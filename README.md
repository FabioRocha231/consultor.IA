# consultor.IA

> Plataforma de IA aplicada a PMEs, construída como fork white-label de um core
> open-source MIT e transformada em produto de produção com privacidade por
> padrão, observabilidade interna e ferramentas controladas.

## What is it?

consultor.IA é uma plataforma de IA conversacional para PMEs. Ela usa o AI Core já existente para chat, RAG, documentos, agentes e APIs, e adiciona uma camada de produto orientada a empresas: onboarding por negócio, configuração RAG controlada, integração com n8n, analytics, feedback e observabilidade.

O produto foi projetado para operação self-hosted. Cada deployment atende uma empresa, mantendo dados, storage, banco e configurações separados por infraestrutura. O MVP entrega um fluxo completo: ingestão de documentos, chat com fallback controlado, tools de negócio via n8n, dashboard por empresa e feedback correlacionado a traces.

O projeto mantém o core aberto como base, mas remove telemetria externa não autorizada e usa um privacy gate no CI para impedir que ela volte em dependências, syncs ou vendoring.

## Architecture

```
+------------------------------------------------------------------+
| Product Layer: consultor.IA UI, Organization, Onboarding,        |
| RAG Config, n8n Tools, Analytics, Feedback, OTel instrumentation |
+------------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------------+
| AI Core: Server, Chat Engine, RAG, Agent Runtime, Document        |
| Engine, HTTP API and Streaming                                     |
+------------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------------+
| Data Plane: PostgreSQL, Qdrant, document storage                  |
+------------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------------+
| Integration Plane: n8n, LLM providers, embeddings, vendored       |
| embed and browser-extension                                        |
+------------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------------+
| Observability: OpenTelemetry -> Grafana Alloy -> Prometheus,      |
| Loki, Tempo -> Grafana                                             |
+------------------------------------------------------------------+
```

O detalhamento completo está em [04 - Target Architecture](docs/architecture/04-target-architecture.md).

## Features

- White-label consultor.IA.
- 1 deployment = 1 empresa, conforme [ADR-003](docs/adr/003-company-isolation-strategy.md).
- RAG config hierárquico com fallback explícito, conforme [ADR-008](docs/adr/008-rag-configuration-strategy.md).
- Integração n8n com tools allowlisted e webhooks assinados.
- OpenTelemetry + Alloy + Grafana para observabilidade interna.
- Feedback positivo/negativo com categoria, comentário e correlação a trace.
- RAG Evaluation Suite para validar retrieval e respostas.
- Privacy CI Gate com scan estático, network smoke e dependency audit.
- Zero External Telemetry: sem telemetria externa não autorizada.
- PostgreSQL como storage principal.
- Dashboard por empresa com métricas de produto e operação.
- Onboarding orientado a negócio em etapas.
- `embed/` e `browser-extension/` vendored no monorepo.

## Privacy

O runtime do consultor.IA não envia telemetria, analytics ou eventos de uso para serviços externos. Telemetria externa foi removida do código e um privacy CI gate bloqueia reintrodução em dependências, syncs ou vendoring. Toda comunicação outbound é auditável e limitada a integrações configuradas pelo administrador.

A auditoria original e a política de soberania de dados estão em [02 - Zero Telemetry Audit](docs/architecture/02-zero-telemetry-audit.md) e [ADR-000](docs/adr/000-zero-telemetry-and-data-sovereignty.md).

## Observability

A instrumentação usa OpenTelemetry no Node.js e cobre HTTP, chat, RAG, LLM, agent, tool e n8n. O app envia OTLP para Grafana Alloy, que roteia para Prometheus, Loki e Tempo; Grafana consome as três fontes para dashboards e diagnóstico. Todos os eventos relevantes carregam `organization_id`, `deployment_id`, `request_id`, `conversation_id` e `trace_id`.

Referências:

- [10 - Observability Architecture](docs/architecture/10-observability-architecture.md)
- [11 - Metrics Spec](docs/architecture/11-metrics-spec.md)
- [12 - Logging Spec](docs/architecture/12-logging-spec.md)
- [13 - Tracing Spec](docs/architecture/13-tracing-spec.md)
- [ADR-001](docs/adr/001-internal-observability-architecture.md)
- [ADR-009](docs/adr/009-sensitive-logging-policy.md)

## RAG

A configuração RAG fica em `Organization.ragConfig` com defaults controlados, override por workspace e fallback explícito: `dont_know`, `human_handoff` ou `general_llm`. A camada de produto resolve a config e injeta nos pontos existentes de chat, API e embed, mantendo o comportamento consistente entre UI, API e widgets.

A suite de avaliação RAG permite validar retrieval e respostas em cenários controlados. Mais detalhes em [ADR-008](docs/adr/008-rag-configuration-strategy.md), [06 - Data Flows](docs/architecture/06-data-flows.md) e [07 - Data Model Changes](docs/architecture/07-data-model-changes.md).

## Integrations

- **n8n**: camada de integração de negócio com webhooks assinados, timeout, retry, idempotency e rate limit. As tools `createLead` e `requestHumanSupport` são exemplos do contrato usado pelo agent runtime.
- **LLM providers**: suporte aos conectores do AI Core, incluindo OpenAI-compatible, Anthropic, Azure, Gemini, Ollama, DeepSeek e outros configuráveis pelo admin.
- **Embed e browser-extension**: componentes vendored no monorepo, sem gitlink e sem ciclo de `submodule sync`.

O contrato de integrações está em [08 - Integration Contracts](docs/architecture/08-integration-contracts.md) e [ADR-005](docs/adr/005-n8n-integration-boundary.md).

## Development

Pré-requisitos: Node `v20.18.1`, Yarn e Docker para o PostgreSQL local.

```bash
git clone git@github.com:FabioRocha231/consultor.IA.git
cd consultor.IA
docker compose -f docker/docker-compose.yml up -d postgres
yarn setup
yarn dev
```

O `yarn setup` instala dependências, copia os `.env` esperados e roda Prisma generate/migrate/seed. O `yarn dev` inicia server, frontend e collector em modo desenvolvimento. Também é possível executar cada parte em terminais separados:

```bash
yarn dev:server
yarn dev:frontend
yarn dev:collector
```

## Deployment

O caminho recomendado é Docker Compose:

```bash
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
```

A imagem monta o app completo, sobe PostgreSQL 16 e expõe a aplicação na porta `3001`. Configure `STORAGE_DIR`, `DB_URL` e as credenciais de LLM/embedding em `docker/.env` antes do primeiro boot. O guia detalhado está em [HOW_TO_USE_DOCKER.md](docker/HOW_TO_USE_DOCKER.md).

Para uma referência de deploy sem container, consulte [BARE_METAL.md](./BARE_METAL.md). Esse caminho é menos suportado e deve ser usado apenas quando a infraestrutura exigir.

## Testing

```bash
yarn test
yarn lint:check
yarn translations:verify
cd server && node scripts/privacy-scan.mjs --json
cd server && node scripts/privacy-scan.mjs --network --json
```

Os testes de runtime ficam no workspace `server`. Lint cobre server, frontend e collector. O check de traduções garante que todas as locales seguem a estrutura de `en`.

## Privacy Gate

O CI executa três camadas de proteção:

- `static-privacy-check`: varre o repositório por domínios proibidos, SDKs, env vars de telemetria e headers sensíveis em logs.
- `network-privacy-check`: importa os módulos de `server/endpoints/` com fetch interceptado e compara hosts contra a allowlist.
- `dependency-audit`: roda `yarn audit` e reporta achados de alta severidade.

Qualquer exceção de telemetria exige ADR e aprovação. O guia de depuração está em [21 - Privacy CI Gate](docs/architecture/21-privacy-ci-gate.md).

## Upstream Strategy

O projeto mantém o upstream como remoto e faz syncs frequentes em branch de integração. Antes do merge, cada sync passa por revisão de código, privacy scan, testes e build. `embed/` e `browser-extension/` são vendored e exigem re-vendoring manual com revisão de diff; não existe mais ciclo de `submodule init/update/sync`.

A estratégia completa está em [ADR-010](docs/adr/010-upstream-synchronization-strategy.md).

## License / Attribution

> consultor.IA is based on AnythingLLM, originally developed by Mintplex Labs, under the MIT License.

consultor.IA é um fork modificado e não é afiliado à Mintplex Labs nem aos mantenedores do projeto original. O aviso de copyright e a licença MIT original estão preservados em [LICENSE](./LICENSE).

Documentos relacionados:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [TERMS_SELF_HOSTED.md](./TERMS_SELF_HOSTED.md)
