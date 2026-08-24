# 26 - Production Readiness Gap Analysis

Análise consolidada para autorizar a entrada em piloto de 3 empresas reais. Combina o handoff pós-MVP, a verificação do master (`25-current-master-verification.md`) e as auditorias delegadas (`22-embed-audit.md`, `23-browser-extension-audit.md`, `24-runtime-egress-map.md`).

Severidades:

- **P0** — bloqueia entrada em piloto. Sem isso, não sobe empresa real.
- **P1** — entra com o piloto. Aceitável com mitigação documentada.
- **P2** — depois dos primeiros 30 dias de operação real.

## Tabela mestra

| # | Área | Estado atual | Gap | Severidade | PR | Recomendação curta |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Runtime egress audit | Privacy gate existe, mas exercita só import-time de `server/endpoints/` | Egress real em jobs, providers, agents, collector, embed, extension não é exercitado em CI | **P0** | 14 | Subir stack em CI/e2e, capturar todo outbound durante workflows críticos, falhar CI se host não está na allowlist. |
| 02 | Deploy-time egress policy | Allowlist global ampla (todos os LLM providers) | Cliente A usa só DeepSeek, mas tem egress possível para OpenAI/Anthropic/etc. | **P0** | 14 | Mover para política por deployment (env-driven) + recomendação deny-by-default na borda (proxy/firewall). |
| 03 | `browser-extension/` | Absorvido do upstream, ainda "AnythingLLM Browser Companion", `<all_urls>` no manifest | Superfície muito maior que a necessária para PME; branding Mintplex | **P0** | 15 | Decidir KEEP/HARDEN/REMOVE após auditoria (`23-browser-extension-audit.md`). Provável: REMOVER do build do piloto; manter código isolado. |
| 04 | `embed/` | Absorvido do upstream, branding AnythingLLM, fetch para `apiBase` configurável + assets | Telemetria upstream residual, branding inconsistente, hardcoded fallbacks | **P0** | 15 | Auditar (`22-embed-audit.md`), rebrand, remover qualquer chamada não aprovada, validar CSP no site hospedeiro. |
| 05 | `traceId` no chat | OTel coleta spans, mas `workspace_chats.traceId` não existe | Feedback não pode ser correlacionado ao trace exato | **P0** | 17 | Adicionar coluna nullable, popular em `apiChatHandler`/`stream`, criar índice composto `(workspaceId, createdAt)`. |
| 06 | Backup/restore | Nenhum script de backup ou restore no repo | Perda de deployment = perda total de dados da empresa | **P0** | 18 | Scripts Postgres (pg_dump) + Qdrant (snapshot) + storage (volume tar) + restore testado em CI mensal. RPO 24h, RTO 4h alvo. |
| 07 | Admin bootstrap | Sem seed, sem mecanismo de primeiro admin | Subir deployment novo exige intervenção manual obscura | **P0** | 16 | Script `prisma/seed.js` idempotente, lê `ADMIN_EMAIL`/`ADMIN_PASSWORD` de env, gera hash bcrypt, falha se já existe admin. Documentar. |
| 08 | Rate limiting | Sem middleware de rate limit em Express | Superfície de login, chat, uploads, agent, n8n tools, embed público sem proteção | **P0** | 19 | `express-rate-limit` em memória para o MVP; mover para Redis depois. Limites por IP e por user-id (quando autenticado). |
| 09 | MetaGenerator branding | Aponta para `https://anythingllm.com` em og:url e twitter:url | Vazamento de identidade ao compartilhar link em redes sociais/Slack | **P1** | 20 | Trocar para URL do deployment ou `https://consultor.IA`. Constante parametrizável. |
| 10 | Grafana dashboards | Plano existe em `14-dashboards-plan.md`, dashboards não materializados | Operador cego durante o piloto | **P1** | 21 | Criar 9 dashboards JSON via provisioning, ligando ao datasource Prometheus/Loki/Tempo. Templates versionados no repo. |
| 11 | Alerting | Plano em `15-alerting-strategy.md`, alertas não configurados | Falha silenciosa de Postgres/Qdrant/LLM no piloto | **P1** | 22 | Grafana alerts com thresholds+window+severity; destinos: webhook/Slack/email. Sem alert fatigue. |
| 12 | RAG live evaluation | Runner é mock determinístico | Não mede qualidade real do RAG do Cliente A | **P1** | 23 | `EVAL_LIVE=false` default, opt-in. Dataset de 50-100 perguntas por piloto. Comparação A/B de config. |
| 13 | README/identidade do repo | README, CONTRIBUTING, SECURITY, TERMS ainda essencialmente AnythingLLM | Credibilidade para cliente abrir issue, recrutamento de contribuidores | **P2** | 24 | Reescrever README com seções: What/Architecture/Features/Privacy/Observability/RAG/Integrations/Development/Deployment/Testing/Privacy Gate/Upstream/License. Preservar notices legais. |
| 14 | Sensitive debug mode | Spec existe em ADR-009, flag não implementada | Quando der ruim no piloto, não há como aprofundar sem expor PII | **P2** | 25 | Implementar `SENSITIVE_DEBUG=false` default, com admin gate, TTL curto, audit log. Só ligar sob demanda. |
| 15 | Grafana Alloy deploy | Referenciado na doc de arquitetura, mas deployment não automatizado | Operador precisa subir Alloy manualmente | **P1** | 21 | Docker Compose inclui Alloy, config provisionada. |
| 16 | Privacy regression no upstream sync | Privacy gate atual pega só código nosso + dependencies | Se upstream adicionar novo analytics SDK, pega; mas se mudar host ou variável de env, pode passar | **P1** | 14 | Estender scan para incluir variáveis de env novas, novos paths de fetch em qualquer arquivo. Doc no runbook. |
| 17 | Multi-tenancy | ADR-003 diz 1 deployment = 1 org, OK para 3 pilotos | Quando passar de 5 deployments vira problema operacional | **P3** | — | Não fazer agora. Reconsiderar pós-piloto. |
| 18 | Logs sensíveis | ADR-009 lista o que NÃO logar; redação não tem teste automatizado | Risco de regressão introduzir log de API key | **P1** | 14 | Adicionar scan estático: padrões de token (`sk-`, `Bearer `, `eyJ`) em arquivos de log. CI falhar se aparecer. |
| 19 | Restore drill | Sem restore drill automatizado | "Backup nunca restaurado não é backup" | **P0** | 18 | Job CI mensal: derruba Postgres temporário, restaura do último backup, executa smoke E2E. Falha = alerta. |

## Resumo por severidade

- **P0 (bloqueia piloto)**: 9 itens — runtime egress, deploy policy, embed/extension audit + decisão, traceId, backup/restore + drill, admin bootstrap, rate limiting.
- **P1 (entra com piloto)**: 7 itens — branding meta, Grafana, alerting, live eval, Alloy deploy, privacy regression, redação de logs sensíveis.
- **P2 (pós-30 dias)**: 2 itens — README, sensitive debug mode.
- **P3 (não agora)**: 1 item — multi-tenancy.

## Interdependências

Antes de liberar piloto da Empresa A, a sequência mínima é:

1. PR 14 (runtime egress) — destrava qualquer validação de rede subsequente.
2. PR 15 (vendored components) — fecha vetor de ataque maior.
3. PR 18 (backup/restore) — necessário porque restore drill depende dele.
4. PR 19 (rate limit) — pode vir em paralelo com 18.
5. PR 17 (traceId) — pode vir em paralelo.
6. PR 16 (admin bootstrap) — pequeno, pode ser junto com 17.

PR 21 (Grafana) + PR 22 (alerting) entram logo após o boot do Cliente A.
PR 23 (live eval) entra quando houver 50+ conversas reais para basear dataset.
PR 24 (README) + PR 25 (sensitive debug) entram depois dos 30 dias.

## Saídas de piloto

Para o piloto ser considerado aceito, todos os P0 precisam estar verdes e os P1 com mitigação documentada. P2 e P3 podem ficar para depois.
