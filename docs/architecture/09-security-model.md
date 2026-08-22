# 09 - Security Model

## Trust zones

```text
Zone 0 - Internet / usuario final
  -> TLS reverse proxy
Zone 1 - consultor.IA app (server + frontend)
  -> auth JWT / API key
Zone 2 - AI Core internals (RAG, agents, collector, Qdrant)
  -> rede interna / rede por deployment
Zone 3 - Integration plane (n8n, business APIs)
  -> allowlist + assinatura
Zone 4 - Observability plane
  -> rede interna separada, dados segmentados
```

## Network boundaries

- Cada deployment em rede Docker própria (`docker/docker-compose.yml` hoje usa bridge `anything-llm`).
- Server <-> Collector local; Server <-> Qdrant interno.
- Server <-> LLM/embeddings: outbound autorizado por config.
- n8n: rede separada ou integration plane; consultor.IA só chama webhooks allowlisted.
- Observability: Alloy/Collector por deployment; backends em rede de ops.
- Bloquear SSRF: validar URL de scraping/agent flows; no MVP não permitir agent flow API call arbitrário em produção.

## Authorization boundaries

- Single-user: `AUTH_TOKEN`/JWT (`server/utils/middleware/validatedRequest.js:33`).
- Multi-user: JWT por usuário, roles `admin`, `manager`, `default` (`server/utils/middleware/multiUserProtected.js:8`, `server/models/user.js:26`).
- Developer API: `api_keys` + `validApiKey` (`server/utils/middleware/validApiKey.js:5`).
- Alvo PR 05: `organization_id` limita acesso a workspaces da empresa. **No MVP, por deployment físico, não precisa de filtro sofisticado, mas a coluna precisa existir.**
- Admin técnico separado do usuário de negócio: HIDE technical settings por role.

## Secret handling

- Secrets em env vars (`server/.env.example`, `docker/.env.example`), nunca no frontend.
- `EncryptionManager` já criptografa dados sensíveis em repouso (`server/utils/EncryptionManager`, `server/utils/boot/index.js:15`).
- Logs/traces: proibido API keys, auth headers, cookies, senhas, tokens, full prompts, full chunks, integration payloads (`ADR-009`, `12-logging-spec.md`).
- Secrets de n8n por organização: `N8N_WEBHOOK_SECRET_*`.
- Backup: secrets não entram em dump; referência a env/secret manager.

## Agent / tool restrictions

- Default tools: `memory`, `doc-summarizer`, `web-scraping` (`server/utils/agents/defaults.js:15`).
- Ferramentas perigosas (filesystem, create-files, Gmail, Calendar, Outlook, SQL, MCP, web search, agent flow API call) devem ser **off por default** ou restritas por allowlist.
- Approval: mecanismo já existe (`server/utils/agents/imported.js:178`); alvo: approval obrigatório para tools de escrita/integração.
- Proibir agent flow `api-call` para URL arbitrária em produção; substituir por n8n tool allowlist.
- Tool reranker é opcional (`AGENT_SKILL_RERANKER_ENABLED`) e não é controle de segurança.

## Document isolation

- Documentos por workspace (`workspace_documents.workspaceId`).
- Qdrant collection por workspace (`server/utils/vectorDbProviders/qdrant/index.js:117`).
- No MVP, isolamento principal é físico: uma empresa = um deployment = um storage/Qdrant/DB.
- `organization_id` deve ser propagado para documentos e chats para auditoria futura.
- Upload malicioso: Collector valida MIME e integridade; limitar tamanho e extensões conforme risco.

## Observability isolation

- Logs/metrics/traces centrais compartilhados, mas com `organization_id`/`deployment_id` (baixa cardinalidade).
- Grafana: datasources/serviços com permissão para ops; dashboards por empresa com RBAC.
- Sensitive Debug Mode: desligado, temporário, auditável e restrito (`ADR-009`).
- Proibido exportar telemetria para fora do plano interno (`ADR-000`).

## Threats x controle

| Threat | Controle |
| --- | --- |
| Cross-company data leakage | deployment físico + `organization_id` + Qdrant/DB isolados |
| Prompt injection | RAG config, allowlist, não expor system prompts; monitorar `fallback`/`human_handoff` |
| System prompt leakage | hidden UI, logs sem prompts |
| Tool abuse | allowlist, approval, sem HTTP arbitrário |
| Unauthorized document access | auth por workspace, storage per deployment |
| API key leakage | env server-only, redação em logs |
| Malicious upload | validation no collector |
| Webhook spoofing | HMAC assinatura n8n |
| Log secret leakage | redação obrigatória |
| Agent destructive action | approval + tools off |
| SSRF | validação URL, allowlist |
| Integration abuse | rate limit, idempotency, timeout |
| RAG poisoning | source metadata, evaluation suite, audit de chunks |

## Riscos aceitos no MVP

- RBAC org-level avançado fica para depois (deployment físico mitiga).
- MCP, Gmail, Calendar, Outlook, SQL ficam fora ou fortemente restritos.
- Sem Kubernetes/service mesh; rede simples por deployment.
