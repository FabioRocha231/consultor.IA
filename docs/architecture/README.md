# consultor.IA - Arquitetura

Este diretório registra o reconhecimento arquitetural do fork do AnythingLLM e o plano para transformá-lo em **consultor.IA**. Todo documento referencia código real do repositório; itens não confirmados estão marcados como `HYPOTHESIS:`.

## TL;DR executivo

- O core do AnythingLLM cobre chat, RAG, documentos, agentes, providers, API, streaming e embeds. Ele deve ser mantido como **AI Core**, não reescrito.
- A diferenciação do consultor.IA fica na camada de produto: empresa, onboarding, RAG config, integrações n8n, observabilidade interna, analytics, feedback e privacidade.
- **Zero External Telemetry é requisito P0.** O fork hoje tem telemetria PostHog ativa por padrão (`server/models/telemetry.js`), survey de onboarding para `onboarding.anythingllm.com` e Community Hub com chamadas externas. A remoção é o PR 01.
- **Maximum Internal Observability também é P0.** O código atual tem logs não estruturados e um `event_logs` simples. O alvo é OpenTelemetry -> Alloy -> Prometheus/Loki/Tempo -> Grafana, sem SaaS externo.
- MVP: 3 empresas piloto, cada uma com deployment próprio (1 deployment por empresa), Qdrant próprio, storage/database próprios e observabilidade compartilhada segmentada por `organization_id`/`deployment_id`.
- A estratégia é **wrapper/adapter/config**, nunca reescrever o core. Sincronização com upstream via processo de desenvolvimento revisado, com privacy CI gate no final.

## Decisões principais

| Decisão | ADR |
| --- | --- |
| Zero telemetria externa não autorizada e soberania de dados | [ADR-000](../adr/000-zero-telemetry-and-data-sovereignty.md) |
| Observabilidade interna OTel + Alloy + Prometheus/Loki/Tempo/Grafana | [ADR-001](../adr/001-internal-observability-architecture.md) |
| AnythingLLM como AI Core (KEEP, não rewrite) | [ADR-002](../adr/002-anythingllm-as-ai-core.md) |
| Isolamento por deployment/empresa (não multi-tenancy no MVP) | [ADR-003](../adr/003-company-isolation-strategy.md) |
| Qdrant por empresa | [ADR-004](../adr/004-qdrant-isolation-strategy.md) |
| n8n como integration boundary | [ADR-005](../adr/005-n8n-integration-boundary.md) |
| Segurança de tool execution | [ADR-006](../adr/006-tool-execution-security-model.md) |
| Abstração de domínio Organization | [ADR-007](../adr/007-organization-domain-abstraction.md) |
| Camada de configuração RAG | [ADR-008](../adr/008-rag-configuration-strategy.md) |
| Política de logging sensível | [ADR-009](../adr/009-sensitive-logging-policy.md) |
| Estratégia de sincronização upstream | [ADR-010](../adr/010-upstream-synchronization-strategy.md) |

## Índice

| Doc | Conteúdo |
| --- | --- |
| [01-current-architecture-map.md](./01-current-architecture-map.md) | Mapa dos componentes atuais com decisão e evidência |
| [02-zero-telemetry-audit.md](./02-zero-telemetry-audit.md) | Auditoria de telemetria/analytics/outbound |
| [03-gap-analysis.md](./03-gap-analysis.md) | Requisitos x capacidade atual |
| [04-target-architecture.md](./04-target-architecture.md) | Arquitetura alvo e diagramas |
| [05-deployment-architecture.md](./05-deployment-architecture.md) | Deploy das 3 empresas |
| [06-data-flows.md](./06-data-flows.md) | Fluxos Chat/RAG/Agent/Tool/n8n/Ingestion/Observability/Feedback |
| [07-data-model-changes.md](./07-data-model-changes.md) | Mudanças mínimas de dados |
| [08-integration-contracts.md](./08-integration-contracts.md) | Contratos consultor.IA x n8n/Qdrant/LLM/OTel |
| [09-security-model.md](./09-security-model.md) | Trust zones, limites e isolamento |
| [10-observability-architecture.md](./10-observability-architecture.md) | Stack e correlação |
| [11-metrics-spec.md](./11-metrics-spec.md) | Métricas e labels |
| [12-logging-spec.md](./12-logging-spec.md) | Schema de logs e redação |
| [13-tracing-spec.md](./13-tracing-spec.md) | Tracing distribuído |
| [14-dashboards-plan.md](./14-dashboards-plan.md) | Grafana dashboards |
| [15-alerting-strategy.md](./15-alerting-strategy.md) | Alertas |
| [16-pr-roadmap.md](./16-pr-roadmap.md) | Roadmap de 13 PRs |
| [17-mvp-done.md](./17-mvp-done.md) | Definition of Done do MVP |
| [18-tech-debt.md](./18-tech-debt.md) | Registro de dívida técnica |
| [19-risks.md](./19-risks.md) | Riscos principais |
| [20-recommended-first-pr.md](./20-recommended-first-pr.md) | PR 01 detalhado |
| [38-alerting-runbook.md](./38-alerting-runbook.md) | Runbook de alertas, thresholds e silenciamento |

## Convenção

- Identificadores, arquivos, ADRs e comandos: inglês.
- Narrativa: PT-BR.
- Evidência: `caminho:linha`.
- Não confirmado: `HYPOTHESIS:`.
