# ADR-008 - RAG Configuration Strategy

## Status

Accepted (proposal for PR 07)

## Context

O fork já guarda parâmetros de RAG por workspace: `similarityThreshold` (default 0.25), `topN` (default 4), `chatMode`, `queryRefusalResponse`, `vectorSearchMode` (`server/models/workspace.js:56`, `server/prisma/schema.prisma:126`). O fluxo de chat aplica esses parâmetros (`server/utils/chats/stream.js:187`). O handoff quer uma camada controlada pelo consultor.IA e fallback explícito (`dont_know`, `human_handoff`, `general_llm`).

## Decision

Criamos `Organization.ragConfig` com defaults controlados: `chunkSize`, `chunkOverlap`, `topK`, `similarityThreshold`, `rerankingEnabled`, `citationsRequired`, `answerOnlyFromKnowledgeBase` e `fallbackBehavior`. Workspace pode ter override, mas cliente não vê knobs técnicos. A camada consultor.IA resolve config e injeta nos pontos existentes (`streamChatWithWorkspace`, `apiChatHandler`, `embed`, `openaiCompatible`). Fallback é configurável e auditável.

## Consequences

- Reusa RAG existente, sem rewrite.
- Uniformiza comportamento entre UI, API e embed.
- Necessita atualizar 4+ pontos de chamada de RAG.
- Melhora controle de alucinação e quality analytics.

## Alternatives considered

- Expor os campos atuais direto ao cliente: viola requisito de simplificação.
- Criar um "RAG service" separado: sobre-engenharia para MVP.
- Ignorar `Organization.ragConfig` e manter por workspace: não atende abstração de produto.
