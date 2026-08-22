# ADR-005 - n8n Integration Boundary

## Status

Accepted (proposal for PR 08)

## Context

O produto precisa integrar CRM, agenda, WhatsApp, e-mail, ERP e APIs externas. O fork não tem integração n8n hoje. Agentes têm tools de web scraping/search e agent flows com API call arbitrário (`server/utils/agentFlows/executors/api-call.js:42`), o que é risco de SSRF/tool abuse.

## Decision

n8n é o integration layer, nunca a engine principal de RAG. consultor.IA chama webhooks n8n via tools explícitas e allowlist por organização, com schema fixo, HMAC, timeout, retry, idempotency, rate limit e correlação. URLs arbitrárias de agentes são proibidas em produção. n8n não recebe documentos nem conhecimento como fonte primária de RAG.

## Consequences

- Reduz SSRF e integração caótica.
- Mantém core de IA dentro do consultor.IA.
- n8n vira um contrato claro com retries e idempotência.
- Clientes precisam configurar webhooks/credenciais por empresa.

## Alternatives considered

- Agents chamando APIs diretamente: risco alto e sem governança.
- n8n como RAG engine: viola princípio do produto.
- Zero integrações no MVP: inviável para casos de negócio (agenda/CRM).
