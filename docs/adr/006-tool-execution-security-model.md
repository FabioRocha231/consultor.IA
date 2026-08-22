# ADR-006 - Tool Execution Security Model

## Status

Accepted (proposal for PR 08, baseline no PR 01)

## Context

O runtime de agentes expõe tools amplas: web-browsing (`server/utils/agents/aibitat/plugins/web-browsing.js`), web-scraping (`server/utils/agents/aibitat/plugins/web-scraping.js`), filesystem, create-files, Gmail, Calendar, Outlook, SQL, MCP e agent flows com HTTP arbitrário (`server/utils/agentFlows/executors/api-call.js:42`). O handoff lista tool abuse e SSRF como ameaças principais.

## Decision

Em produção, as tools permitidas para agentes são um allowlist explícita por organização. Ferramentas de escrita, integração e HTTP externo exigem approval humano ou contrato n8n assinado. Não habilitamos por default: filesystem, create-files, Gmail, Calendar, Outlook, SQL, MCP, web search e agent flow API call. `web-scraping` fica restrito a URLs aprovadas ou desabilitado conforme risco.

## Consequences

- Menor superfície de ataque.
- Requer definição de produto sobre quais tools cada empresa pode usar.
- Pode reduzir autonomia do agente em alguns fluxos.
- Exige auditoria e logs de tool calls.

## Alternatives considered

- Manter todas as tools com approval: possível, mas approval para tudo gera atrito e risco de "yes fatigue".
- Bloquear agentes no MVP: elimina casos de negócio; preferimos allowlist pequena.
- Restringir no frontend apenas: não é suficiente; enforcement deve ser server-side.
