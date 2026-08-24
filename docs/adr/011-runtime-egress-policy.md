# ADR-011 - Runtime Egress Policy

## Status

Accepted

## Context

O privacy gate existente (`privacy-scan.mjs`) valida estática e network-level que nenhuma telemetria externa foi reintroduzida, mas não prova que o runtime real do servidor só fala com hosts autorizados. O mapa em `24-runtime-egress-map.md` mostra que servidor, collector, providers, agentes, n8n, MCP, Telegram e jobs podem abrir conexões em runtime.

O consultor.IA precisa de evidência automatizada de que os fluxos críticos (boot, auth, workspace, upload, embedding, Qdrant, RAG, chat, agente, n8n, feedback, eval) não fazem egress inesperado. Essa evidência é requisito para manter o claim `zero external telemetry` defensável após syncs com o upstream.

## Decision

Adotar uma política de egress em camadas:

- **Layer 1**: scan estático (`privacy-scan.mjs --json`), já existente.
- **Layer 2**: smoke de import-time (`privacy-scan.mjs --network --json`), já existente.
- **Layer 3**: runtime audit (`privacy-scan.mjs --runtime --json`), que sobe um server isolado com LLM e n8n stub locais, exercita workflows reais, captura conexões via proxy e compara contra `privacy-runtime-allowlist.json`.
- **Layer 4**: deploy policy via `DEPLOYMENT_EGRESS_DOMAINS`, documentada para cada deployment.
- **Layer 5**: deny-by-default na borda (Caddy/Traefik/nginx com allowlist), recomendada e documentada, não implementada no código do produto.

A allowlist runtime é separada da allowlist estática: a estática cobre os hosts que o código suporta; a runtime cobre os hosts que este deployment efetivamente exercita no master. A runtime começa com hosts locais e os LLM providers ativos confirmados no egress map.

O harness não altera o runtime do produto. Ele usa stubs HTTP locais para LLM e n8n, Postgres/Qdrant isolados em CI via service containers, e reporta falhas apenas quando um host observado não está na allowlist runtime.

## Consequences

- O CI passa a falhar se um sync futuro reintroduzir um host externo não autorizado em qualquer workflow exercitado.
- O harness adiciona tempo de CI e requer Postgres/Qdrant disponíveis.
- Workflows que dependem de collector ou credenciais externas ficam registrados como `error` no relatório quando não podem ser exercitados no ambiente isolado, sem bloquear o restante da auditoria.
- `DEPLOYMENT_EGRESS_DOMAINS` não é um firewall; deployments produtivos precisam aplicar deny-by-default fora do código.

## Alternatives considered

- Apenas reforçar o scan estático: não cobre SDKs, jobs, agentes e conexões dinâmicas.
- Mock em código dos providers: menos fiel ao runtime e poderia esconder egress em paths não mapeados.
- Implementar deny-by-default no código do produto: invasivo e inadequado, pois a borda do deployment é o ponto correto para essa política.
