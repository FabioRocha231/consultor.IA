# PR 48 - Interactive lists e buttons no WhatsApp (PR-NEW-3)

## Contexto

Cliente leigo precisa escolher item do cardápio e agir sobre o pedido sem
digitar texto. O PR adiciona UX mínima do WhatsApp: lista interativa para
cardápio, botões para confirmação e normalização das respostas no webhook.

## Wire format

A tool devolve uma string reservada que o worker interpreta antes de chamar a
Cloud API:

```js
const INTERACTIVE_MARKER = "__INTERACTIVE__:";
`${INTERACTIVE_MARKER}${JSON.stringify({ text, interactive })}`;
```

- `getMenuInteractive` retorna `{"type":"list", ...}` com seções por categoria.
- `buildOrderConfirmationPayload` retorna `{"type":"button", ...}` com
  Confirmar/Cancelar/Editar.
- `server/jobs/process-whatsapp-messages.js` faz parse do marker e chama
  `sendWhatsAppList` ou `sendWhatsAppButtons`.
- O webhook normaliza `interactive.list_reply` / `interactive.button_reply`
  para `message.text.body`, mantendo o agente no fluxo de texto.

A Cloud API é chamada em `graph.facebook.com/v23.0/<phoneNumberId>/messages`
com `type: "interactive"`.

## Limites considerados

| Campo | Limite/constante |
| --- | --- |
| Sections da lista | 10 (`MAX_SECTIONS`) |
| Rows por section | 10 (`MAX_ROWS_PER_SECTION`) |
| Botões reply | 3 (`MAX_BUTTONS`) |
| Título de section/row | 24 chars |
| Descrição de row | 72 chars |
| Header/body/footer | 60 / 1024 / 60 chars |
| Label do botão da lista | 20 chars |
| Título de botão reply | 20 chars |

## Diff resumido

- `server/integrations/whatsapp/client.js`: `sendWhatsAppList`,
  `sendWhatsAppButtons`, `sendInteractive`.
- `server/integrations/whatsapp/interactive.js`: buildes, `INTERACTIVE_MARKER`
  e constantes de limite.
- `server/integrations/n8n/tools/getMenuInteractive.js` + registration no tool
  index.
- `server/endpoints/whatsapp.js`: normalização de replies interativos.
- `server/jobs/process-whatsapp-messages.js`: parse do marker e envio
  interativo.
- Total: 12 arquivos, +983/-40.

## Quality gates

`90/823`; 9 checks verdes.

## Rollback

`git revert 920c911a`. Não há migration; o rollback restaura o webhook para
texto puro e remove os clientes/builders interativos.

## Notas

- No commit do PR, `buildOrderConfirmationPayload` ainda não está conectado ao
  fluxo de `createOrder`; o `sendWhatsAppButtons` já era suportado pelo worker,
  mas o fluxo completo de confirmação ficou como follow-up.
- `skipHandleExecution = true` evita que o agente continue executando depois de
  devolver o marker interativo.

## Referências

- [ADR-015 Menu and Orders Domain](../adr/015-menu-and-orders-domain.md)
- PR #48
