# 18 - Technical Debt Register

Dívidas deliberadas para o MVP. Cada item tem upgrade path.

| Item | Impact | Why deferred | Upgrade path |
| --- | --- | --- | --- |
| Multi-tenancy lógico | 3 deployments separados, mais infra | simplicidade e isolamento | `organization_id` + filtros por org; migrar para shared DB |
| Horizontal scaling | deployment único por empresa | escala não existe | stateless server + shared Postgres/Qdrant/object storage |
| Kubernetes | Docker Compose simples | 3 pilotos | Helm/K8s depois se operação exigir |
| Multi-region | sem | não necessário | infra global depois |
| Advanced model router | model router simples existe | MVP | usar `model_routers` existente conforme demanda |
| Automatic RAG optimization | eval manual | MVP | evaluation suite vira otimização |
| Enterprise RBAC | roles simples | MVP | org-level RBAC |
| Billing | sem | MVP | analytics de custo primeiro |
| Cross-company management plane | sem | MVP | dashboard central depois |
| Embed/browser-extension branding | submodulos não inicializados | não é core de PME | auditar e rebrandar antes de distribuir |
| Mobile | sem | não objetivo | mantém endpoints mobile existentes |
| Sensitive Debug Mode completo | PR 09 | P1 | ativar com auditoria |
| SQL agent / MCP / Gmail / Calendar / Outlook | bloqueados ou restritos | risco alto | allowlist por empresa se cliente pedir |
| Model pricing remoto | `models.dev` refresh | precisa decisão | self-host/static pricing |
| Local model fallback CDN | cdn.anythingllm.com | precisa decisão | pré-baixar modelos na imagem |
| PostgreSQL migration | SQLite default | deploy inicial | usar Postgres por empresa no deploy |
| Teste de rede empírico | não feito neste ciclo | PR 13 | executar antes do deploy |
| Agent flow API call arbitrário | existe hoje | PR 08 | substituir por tools n8n allowlist |
