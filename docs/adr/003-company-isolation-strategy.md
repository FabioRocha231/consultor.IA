# ADR-003 - Company Isolation Strategy

## Status

Accepted (proposal for PR 05/deploy)

## Context

O MVP atende 3 empresas de nichos diferentes. O handoff pergunta se devemos usar multi-tenancy lógico ou deployments separados. Segurança entre empresas é prioridade sobre economia de infraestrutura. Não queremos otimizar para centenas de tenants agora, mas não podemos impossibilitar evolução.

## Decision

Para o MVP, uma empresa = um deployment do consultor.IA (server/frontend/collector + database + storage + Qdrant + secrets). O observability stack pode ser compartilhado, mas todo evento carrega `organization_id`/`deployment_id` para segmentação. Introduzimos a entidade `Organization` e `organization_id` em `users`/`workspaces` para preparar evolução, mas não criamos multi-tenancy lógico neste ciclo.

## Consequences

- Isolamento físico forte e rollback por empresa.
- Custo/operação maior que shared stack.
- Sem risco de leakage entre empresas no MVP.
- Migração futura para multi-tenancy exige esforço, mas o schema mínimo evita bloqueio.

## Alternatives considered

- Multi-tenancy lógico no mesmo deployment: mais barato, mas maior risco e mais código de isolamento.
- Uma instância por empresa sem `organization_id`: mais simples, mas dificulta evolução e auditoria.
- Kubernetes/multi-region: fora de escopo.
