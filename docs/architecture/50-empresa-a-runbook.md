# 50 - Runbook operacional do Empresa A (restaurante)

## Visão geral

Este runbook cobre o ciclo completo de vida do deployment Empresa A no
piloto: setup inicial, smoke test, operação diária e incident response
básico.

Pré-requisitos:
- consultor.IA deployado em Dokploy (ver [31-admin-bootstrap-runbook.md](./31-admin-bootstrap-runbook.md))
- `DB_URL`, `JWT_SECRET` e credenciais LLM configuradas
- Acesso admin ao painel

## 1. Setup inicial

### 1.1 Seed do cardápio

```bash
# Conectar ao container do server
DB_URL=postgresql://... yarn seed:menu
# Primeira execução esperada: created=11 skipped=0 failed=0
# Re-execução esperada: created=0 skipped=11 failed=0
```

Idempotente — pode re-rodar. Itens existentes aparecem como `skip`.

### 1.2 Configurar WhatsApp Business

Ver guia completo em [HANDOFF-POST-MVP.md](../../HANDOFF-POST-MVP.md) e no PR #44.

Resumo:
- Meta Business Account → WABA → número
- Meta for Developers → App com produto WhatsApp
- System User Admin com `whatsapp_business_messaging` + `whatsapp_business_management`
- App secret + Phone number ID + Permanent access token + verify token arbitrário

Inserir via `POST /api/whatsapp/connect` (single-user mode) ou via painel UI.

### 1.3 Webhook setup

URL pública do deployment: `https://<host>/api/whatsapp/webhook`

No Meta for Developers → Webhooks:
- Callback URL: a URL acima
- Verify token: o mesmo valor inserido em 1.2
- Subscribe to: `messages` (obrigatório), `message_template_status_update` (opcional)

## 2. Smoke test

### 2.1 Cardápio funciona

```bash
# Admin UI: /settings/menu → confirma 11 itens visíveis
# Ou via API:
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/menu/items
```

### 2.2 WhatsApp entrega

Enviar mensagem de WhatsApp para o número configurado:
- Cliente manda: "oi"
- Esperado: agent responde em segundos, log em `process-whatsapp-messages`
- Verificar no log: `[WhatsApp worker started (poll=5000ms)]` e linha de processamento

### 2.3 Cardápio interativo

Cliente manda: "cardápio"
- Esperado: lista interativa WhatsApp com seções por categoria
- Tap em qualquer item → resposta em texto + pergunta sobre quantidade

### 2.4 Pedido + confirmação

Cliente manda: "1 margherita"
- Esperado: botões Confirmar/Cancelar/Editar
- Tap em Confirmar → status vira confirmed + cliente recebe WhatsApp

### 2.5 Notificação de status

Admin vai em /settings/orders → muda status para preparing
- Esperado: cliente recebe WhatsApp "Seu pedido está sendo preparado! 🍳"

## 3. Operação diária

### 3.1 Logs importantes

- `WhatsApp worker started` (boot, uma vez)
- `WhatsApp queue iteration failed` (warn, raro)
- `Processed N of M WhatsApp messages` (info, por poll)
- `Aborting: N consecutive errors` (erro crítico, ver 4.1)

### 3.2 Backups

Ver [33-backup-restore-runbook.md](./33-backup-restore-runbook.md). Backup diário via:

```bash
docker/scripts/backup.sh
```

Restore só em ambiente isolado (NUNCA no deploy de produção direto).

### 3.3 Calibração de alertas (após 7-15 dias)

Ajustar thresholds no `infra/grafana/provisioning/alerting/`:
- `08-n8n-failure-rate.yaml`: 25% → ajustar com base em dados reais
- `09-feedback-negative-spike.yaml`: 3/15min → ajustar com base em dados reais

Não calibrar antes de ter volume real. Documentar alterações em CHANGELOG.

## 4. Incident response

### 4.1 Worker WhatsApp crashloop

Sintoma: log `Aborting: 10 consecutive errors` ou pod reiniciando.

Ações:
1. `docker logs anythingllm --tail 200 | grep WhatsApp`
2. Identificar o erro (DB? Cloud API? Token revogado/inválido?)
3. Se DB: validar `pg_isready` e pool
4. Se Cloud API: verificar se o token está ativo e com as permissões corretas (`whatsapp_business_messaging`)
5. Se token inválido/revogado: regenerar via Meta System User → atualizar connector via `POST /api/whatsapp/connect`

### 4.2 Clientes não recebem mensagens

Sintoma: admin atualiza status mas cliente não recebe WhatsApp.

Ações:
1. Verificar se connector está active: `GET /api/whatsapp/config`
2. Se inativo: reativar via painel UI
3. Se ativo: ver log `Failed to notify customer of order status change`
4. Se erro for 401/403: token inválido/revogado (ver 4.1)

### 4.3 Pedidos duplicados

Sintoma: cliente recebe confirmação 2x do mesmo pedido.

Causa provável: cliente reenviou mensagem, agent processou 2x. Mitigação:
- Idempotency-Key no endpoint (`>= 16 chars`) já previne duplicidade em retries da API
- Tool `createOrder` usa `crypto.randomUUID()` então cada chamada tem ID único
- WhatsApp Cloud API tem retry próprio; o worker marca como processed na fila
- Se ainda ocorrer: investigar webhook delivery rate no Meta Dashboard

## 5. Limpeza operacional

### 5.1 Logs antigos

A fila `whatsapp_webhook_messages` retém 30 dias de mensagens processadas. Limpar:

```sql
DELETE FROM whatsapp_webhook_messages WHERE processed_at < NOW() - INTERVAL '30 days';
```

(O worker também faz isso automaticamente — `deleteOldMessages()` em `server/jobs/process-whatsapp-messages.js`.)

### 5.2 Métricas OTel

Verificar que counters estão emitindo em Prometheus:
- `whatsapp_interactive_sent_total{type="list"|"button"}` (a ser adicionado — ver follow-up)
- `feedback_positive_total` / `feedback_negative_total` (já existe)
- `http_request_duration_seconds` (já existe)

## Referências

- PRs #46 a #55 — feature implementation
- [41-pr29-pilot-critical-metrics.md](./41-pr29-pilot-critical-metrics.md) — métricas OTel
- [33-backup-restore-runbook.md](./33-backup-restore-runbook.md) — backup
- [ADR-015](../adr/015-menu-and-orders-domain.md) — decisões de domínio
- [HANDOFF-EMPRESA-A.md](../../HANDOFF-EMPRESA-A.md) — fase final do production readiness
