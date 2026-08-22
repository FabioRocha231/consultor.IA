# ADR-002 - AnythingLLM as AI Core

## Status

Accepted

## Context

O projeto precisa de chat, RAG, documentos, agentes, providers, streaming e API. O fork já implementa todos esses recursos: `server/utils/chats/stream.js:24`, `server/utils/vectorDbProviders/qdrant/index.js`, `server/utils/agents/index.js`, `server/endpoints/api/index.js`. Reescrever seria caro e arriscado.

## Decision

AnythingLLM é o AI Core. consultor.IA adiciona product layer, UX, empresa, configuração, integrações, observabilidade, segurança e analytics por wrapper, adapter, extension, feature flag, configuration, service ou domain layer. Não faremos rewrite de core, RAG, agent runtime, vector engine ou model routing. Alterações no core são aceitas apenas quando necessárias e pequenas.

## Consequences

- Aproveita funcionalidades maduras e atualizações upstream.
- Alguns requisitos exigem alterações pontuais no core (tracing, org id, fallback), que devem ser feitas com testes e revisão.
- Conflito upstream precisa ser gerenciado por sync frequente e ADR-010.
- Dívida e features upstream não relevantes podem permanecer (ex.: alguns connectors), com HIDE/REMOVE por produto.

## Alternatives considered

- Construir produto do zero: rejeitado por custo/risco.
- Substituir agent runtime/RAG: rejeitado; não é necessário para MVP.
- Extrair microservices: rejeitado; complexidade sem escala.
