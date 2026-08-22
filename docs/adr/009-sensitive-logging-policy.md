# ADR-009 - Sensitive Logging Policy

## Status

Accepted (proposal for PR 02, refinado no PR 09)

## Context

Observabilidade máxima não pode significar armazenar prompts, documentos, chunks, chaves e payloads. O código atual loga muitos objetos e erros sem redação (ex.: `server/middleware/httpLogger.js`, `server/models/eventLogs.js`, `server/utils/agents/aibitat/plugins/web-scraping.js`). O handoff pede Sensitive Debug Mode separado.

## Decision

Logs, métricas e traces não contêm por padrão: API keys, Authorization headers, cookies, senhas, tokens, secret env vars, full prompts, full documents, full retrieved chunks e payloads sensíveis de integração. Campos permitidos: IDs, metadata, hashes, sizes, counts, latency, status, scores e cost. `Sensitive Debug Mode` é desligado por padrão, temporário, auditável, restrito a admin, com retenção curta e habilitação explícita.

## Consequences

- Requer helper de redação e schema central.
- Menos contexto automático para debug, compensado por IDs/traces e debug mode.
- Compliance e segurança melhoram.
- Treinamento da equipe para usar debug mode corretamente.

## Alternatives considered

- Logar tudo por padrão: risco alto de vazamento; viola requisito.
- Redigir apenas alguns campos: insuficiente sem schema central.
- Não ter debug mode: dificulta diagnóstico de qualidade; P1 do handoff.
