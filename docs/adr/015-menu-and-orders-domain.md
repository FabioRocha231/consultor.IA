# ADR-015 - Menu and Orders Domain

## Status

Accepted (proposal for PRs 46/47)

## Context

A Fase Empresa A (restaurante) precisa vender a partir do cardápio e registrar
pedidos pelo WhatsApp, que é o canal principal do cliente final. Os PRs 46/47
criaram esse domínio local dentro do consultor.IA com simplicidade deliberada
("sem rebranding cabuloso" no piloto): sem backend externo, sem gateway de
pagamento e sem modelagem de catálogo cara demais para o MVP.

## Decision

- `MenuItem`: tenant key por `organizationId`, com `category`, `name`,
  `priceCents` em centavos inteiros, `available`, `position`, `description`,
  `allergens`, `photoUrl` e `currency` default `BRL`.
- `Order` + `OrderItem`: `OrderItem.orderId` com FK CASCADE; `status` é string
  livre, validada pela state machine, não por enum do schema.
- State machine em arquivo separado (`server/models/orderStateMachine.js`) com
  transições explícitas: `pending -> confirmed -> preparing -> ready ->
  delivered`; `cancelled` é estado terminal alternativo a partir de
  pending/confirmed/preparing.
- Idempotência no `POST /api/orders`: header `Idempotency-Key` com no mínimo 16
  caracteres, persistido em UNIQUE constraint. O lookup por chave sempre inclui
  `organizationId`, mantendo isolamento de tenant mesmo com unicidade global.
- `Idempotency-Key` no tool `createOrder` é gerada client-side com
  `crypto.randomUUID()`.
- Tenant isolation sempre via `organizationId` em WHERE, sem relations Prisma
  para dominar o escopo do fork.
- Mensagens livres ficam em `Order.notes` / `OrderItem.notes` (endereço de
  entrega ou observações), sem modelo separado.
- `available: boolean` cobre disponibilidade simples; não há agendamento por
  horário no MVP.
- Preço do pedido é calculado no create a partir do `MenuItem.priceCents`
  corrente e congelado em `OrderItem.unitPriceCents` como snapshot.

## Consequences

- Modelo pequeno, barato de migrar e fácil de evoluir para Empresa B/C.
- `OrderItem.menuItemId` é referência inteira sem FK/relation Prisma, então
  deletar ou remover item do cardápio não cascateia e pedidos históricos
  preservam a referência e o preço capturado.
- `status` continua eficiente para UI/tools, mas toda mudança passa pela state
  machine central; novos fluxos exigem alterar o arquivo e os testes.
- `idempotencyKey` unique global simplifica deduplicação, mas já foi desenhado
  para ser consultado sempre junto com `organizationId`.
- Sem pagamento e sem scheduling, piloto fica focado em coleta de pedido e
  operação manual da cozinha.

## Alternatives considered

- Variações de produto (size, extras, combos): não cabem no MVP e podem virar
  modelo próprio depois.
- Agendamento por horário/disponibilidade temporal: YAGNI para o piloto.
- Payment integration: fora do escopo do piloto; `externalRef` fica pronto para
  integração futura sem acoplar a API.
- Ordem em sistema externo: adiado; pedido local reduz dependência de n8n e
  permite validar o fluxo do restaurante primeiro.

## References

- PR #46 (MenuItem e `/api/menu/items`)
- PR #47 (Order, OrderItem, state machine, idempotência e tools de pedido)
- PR #48 (menus/buttons interativos no WhatsApp)
- PR #49 (worker WhatsApp long-lived polling)
