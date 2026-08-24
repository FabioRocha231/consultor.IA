# 32 - Trace Persistence Runbook

## Como encontrar o trace de uma mensagem

1. Busque a mensagem na UI ou via `GET /api/workspace/:slug/chats`.
2. O registro assistant retorna `traceId` quando o trace OTel estava ativo.
3. Abra Grafana, vá em Explore, selecione Tempo e pesquise pelo `traceId`.
4. Se o trace não existir, verifique a retenção do Tempo e se o chat foi criado por um caminho com OTel ativo.

## Como correlacionar feedback negativo

1. Consulte `GET /api/feedback` com filtros de score/categoria.
2. O item de feedback retorna `traceId`.
3. Abra o trace no Tempo para revisar retrieval, LLM e tools daquela resposta.

## Queries operacionais comuns

```sql
-- Feedback recente com trace
SELECT id, "workspaceId", prompt, "traceId", "feedbackCategory", "feedbackAt"
FROM workspace_chats
WHERE "feedbackScore" = false
ORDER BY id DESC
LIMIT 100;

-- Mensagens sem trace (caminhos legados ou OTel desligado)
SELECT id, "workspaceId", prompt, "createdAt"
FROM workspace_chats
WHERE "traceId" IS NULL
ORDER BY id DESC
LIMIT 100;

-- Mensagens de um trace específico
SELECT id, "workspaceId", prompt, "traceId", "createdAt"
FROM workspace_chats
WHERE "traceId" = '<trace_id>';
```
