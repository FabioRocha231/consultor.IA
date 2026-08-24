# ADR-014 - Trace Persistence Strategy

## Status

Accepted (proposal for PR 17)

## Context

O consultor.IA já emite spans OpenTelemetry para chat, RAG, LLM, agentes e tools, mas `workspace_chats` não armazena o `trace_id`. Sem ele, um feedback negativo ou uma mensagem específica não pode ser correlacionado ao trace exato no Tempo/Grafana.

## Decision

Persistir `traceId` em `workspace_chats` como campo opcional de 32 caracteres hex, capturado do span OTel ativo no momento da persistência. O modelo aceita `traceId` explícito e, quando ausente, tenta derivar do contexto ativo. O valor é validado antes do insert/update. A API expõe `traceId` no histórico e no feedback, e a UI mostra um link placeholder para o explorer de traces.

## Consequences

- Correlação direta entre mensagem, feedback e trace.
- Custo de armazenamento pequeno: ~32 chars por mensagem que possui trace.
- Índices adicionais `(workspaceId, createdAt)` e `(traceId)` aumentam levemente o custo de escrita.
- O link atual aponta para `https://grafana.local/explore?trace=<traceId>`; um explorer próprio pode substituí-lo depois.
- Retenção do Tempo precisa ser compatível com a retenção do banco, ou o link pode abrir um trace expirado.

## Alternatives considered

- **Log shipping only**: resolve diagnóstico operacional, mas não permite consultar/correlacionar pelo feedback na API.
- **Span attributes only**: mantém o dado só na telemetria e não persiste a relação com a mensagem.
- **Custom trace table**: normaliza futuras correlações multi-span, mas adiciona complexidade sem necessidade para o MVP.
