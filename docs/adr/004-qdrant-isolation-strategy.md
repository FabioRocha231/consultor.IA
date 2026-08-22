# ADR-004 - Qdrant Isolation Strategy

## Status

Accepted (proposal for deployment)

## Context

O AnythingLLM suporta Qdrant (`server/utils/vectorDbProviders/qdrant/index.js`) e cria uma collection por namespace/workspace (`server/utils/vectorDbProviders/qdrant/index.js:117`). O default atual é LanceDB (`server/.env.example:304`). Para o MVP, cada empresa precisa de base de conhecimento isolada.

## Decision

Usamos Qdrant por empresa. Cada deployment tem seu próprio Qdrant (`QDRANT_ENDPOINT`/`QDRANT_API_KEY`) e collection por workspace. Não compartilhamos Qdrant entre empresas no MVP. Dimensões e distância são fixadas pelo adapter (`Cosine`); cache de embeddings fica no storage do deployment.

## Consequences

- Isolamento vetorial forte.
- Adapter Qdrant já existe, reduzindo trabalho.
- Operação de Qdrant por empresa adiciona infra.
- Evita risco de namespace colisão entre empresas.

## Alternatives considered

- LanceDB por empresa: funciona, mas handoff pede Qdrant e Qdrant isola melhor em rede.
- Qdrant único com collections por empresa: possível, mas aumenta superfície de cross-tenant e não traz ganho relevante para 3 pilotos.
- Vector DB na nuvem (Pinecone etc.): SaaS com dados fora de controle; desalinhado com soberania.
