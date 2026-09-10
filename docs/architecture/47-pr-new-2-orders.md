# PR 47 - Pedidos com state machine e idempotência (PR-NEW-2)

## Contexto

O cliente final pede pelo WhatsApp ou pelo assistente; a operação precisa ver
pedidos, atualizar status e evitar duplicidade nos retries. O PR cria `Order` +
`OrderItem`, state machine explícita, endpoints REST e 4 tools de pedido.

## State machine

| De | Para |
| --- | --- |
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `preparing`, `cancelled` |
| `preparing` | `ready`, `cancelled` |
| `ready` | `delivered` |
| `delivered` | terminal |
| `cancelled` | terminal |

## Diff resumido

- `server/prisma/schema.prisma` + migration `20260910113103_add_orders`
  (`orders`, `order_items`, UNIQUE em `idempotency_key`).
- `server/models/orderStateMachine.js`, `server/models/orders.js`.
- Endpoints `/api/orders`, `/api/orders/by-phone/:phone`, `/api/orders/:id` e
  `/api/orders/:id/status`.
- Tools `createOrder`, `getOrderStatus`, `listMyOrders`, `updateOrderStatus`.
- Frontend `/settings/orders` (`frontend/src/pages/GeneralSettings/Orders/*`).
- `POST /api/orders` exige `Idempotency-Key` >= 16 chars; a model reusa o
  pedido existente quando a chave já foi usada.
- Total: 48 arquivos, +1687/-1.

## Quality gates

`88/808`; 9 checks verdes.

## Rollback

`git revert ae22edf3`. O revert restaura schema/model/endpoints/frontend; as
tabelas `orders` e `order_items` precisam ser removidas pela migration reversa
antes de rodar uma nova migration.

## Notas

- A migration inicial não criou `order_items_order_id_idx`; o schema declara
  `@@index([orderId])`, então esse índice deve ser confirmado/regenerado em uma
  migration futura.
- `createOrder` gera `idempotencyKey` client-side com `crypto.randomUUID()`.
- `OrderItem.menuItemId` não tem FK; `unitPriceCents` é snapshot do preço no
  momento do pedido.

## Referências

- [ADR-015 Menu and Orders Domain](../adr/015-menu-and-orders-domain.md)
- PR #47
