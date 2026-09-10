# PR 46 - Cardápio do restaurante (PR-NEW-1)

## Contexto

O consultor.IA precisa responder perguntas de cardápio e permitir o cadastro
operacional da Empresa A pelo próprio painel. O PR cria uma entidade local
`MenuItem`, CRUD mínimo e o tool `getMenu` para o agente.

## Diff resumido

- `server/prisma/schema.prisma` + migration `20260910103313_add_menu_items`
  com índices `(organizationId, category, position)` e `(organizationId,
  available)`.
- CRUD em `server/models/menuItems.js` e `server/endpoints/menu.js`
  (`/api/menu/items`).
- Tool `getMenu` em `server/integrations/n8n/tools/getMenu.js`, com busca por
  query/categoria e formatação PT-BR.
- Frontend `/settings/menu` (`frontend/src/pages/GeneralSettings/Menu/*`).
- Testes endpoint/tool em `server/__tests__/endpoints/menu.test.js` e
  `server/__tests__/integrations/n8n/tools/getMenu.test.js`.
- Total: 44 arquivos, +1338/-2.

## Quality gates

`85/794`; 9 checks verdes.

## Rollback

`git revert ef85b1c0`. A migration de `menu_items` é dropada pelo revert; os
dados criados durante a janela do PR não são preservados.

## Notas

- O model test ficou fora do commit por `.gitignore`.
- `MenuItem` não cria relation Prisma; todas as leituras filtram por
  `organizationId`.

## Referências

- [ADR-015 Menu and Orders Domain](../adr/015-menu-and-orders-domain.md)
- PR #46
