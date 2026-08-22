# ADR-007 - Organization Domain Abstraction

## Status

Accepted (proposal for PR 05)

## Context

O produto é para PMEs e cada deployment representa uma empresa. O modelo atual tem `workspaces` como container de conhecimento/config (`server/prisma/schema.prisma:114`) e `users` sem vínculo organizacional. O handoff pede uma abstração Organization com branding, aiConfig, ragConfig, assistants, knowledgeBases e integrations.

## Decision

Criamos uma entidade mínima `organizations` com `name`, `slug`, `segment`, `status`, `branding`, `aiConfig`, `ragConfig` e `integrations` (JSON), e adicionamos `organization_id` opcional a `users` e `workspaces`. No MVP, uma organização corresponde a um deployment; `workspaces` continuam sendo os assistentes/bases de conhecimento dentro da organização. Não criamos multi-tenancy completo.

## Consequences

- Modela domínio de produto sem reescrever core.
- Prepara evolução futura sem pagar custo agora.
- Requer migration e seed por empresa.
- Overhead pequeno no MVP.

## Alternatives considered

- Usar `workspaces` como Organization: confunde níveis e não representa branding/segment/integrations.
- Criar somente `system_settings` com prefixo `org_*`: frágil e sem relações.
- Multi-tenancy completo agora: complexidade desnecessária.
