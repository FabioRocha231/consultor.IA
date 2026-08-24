# 27 - Revised PR Roadmap (post-MVP)

Confirma e ajusta a numeração proposta no handoff pós-MVP. Baseado em `26-production-readiness-gap-analysis.md`.

## Convenção

- Branch prefix: `codex/`
- Cada PR = 1 branch curto + 1 PR no GitHub + merge squash + branch remota deletada após merge.
- CI deve estar 100% verde antes de pedir review.
- Cada PR gera/atualiza 1 doc em `docs/architecture/` (acceptance criteria + verificação).

## Roadmap (ordem recomendada)

| PR | Título | Branch | Depende de | Entrega |
| --- | --- | --- | --- | --- |
| **14** | `privacy/runtime-egress-audit` | `codex/pr14-runtime-egress-audit` | — | Privacy gate forte: exercita runtime real em CI, captura outbound durante workflows críticos, falha se host não está na allowlist. Atualiza allowlist com achados. ADR-011. |
| **15** | `security/vendored-components-hardening` | `codex/pr15-vendored-components` | 14 | Auditoria e decisão sobre `embed/` e `browser-extension/`. Para embed: rebrand + remover chamadas não aprovadas. Para extension: decisão KEEP/HARDEN/REMOVE. Provável REMOVE do build de piloto. |
| **16** | `production/admin-bootstrap` | `codex/pr16-admin-bootstrap` | — | `prisma/seed.js` idempotente que cria primeiro admin a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars. Bcrypt. Falha se já existe admin. Documentação no onboarding runbook. |
| **17** | `observability/persist-trace-id` | `codex/pr17-persist-trace-id` | — | Adiciona `workspace_chats.traceId` (nullable). Popula em `apiChatHandler` e `stream.js`. Índice `(workspaceId, createdAt)`. Endpoint de leitura inclui `traceId`. UI exibe link "view trace" no feedback. ADR-014. |
| **18** | `production/backup-restore` | `codex/pr18-backup-restore` | — | Scripts: `backup.sh` (Postgres pg_dump + Qdrant snapshot + tar do storage volume), `restore.sh`. Job CI mensal que executa restore drill. ADR-012. RPO 24h, RTO 4h documentados. |
| **19** | `security/rate-limiting` | `codex/pr19-rate-limiting` | — | `express-rate-limit` em memória no MVP. Limites por IP (login, embed público) e por user (chat, agent, upload). Métricas `rate_limit_blocked_total`. |
| **20** | `docs/branding-meta` | `codex/pr20-branding-meta` | — | Troca `https://anythingllm.com` em `MetaGenerator.js:84,116` por URL parametrizada. Constante `DEPLOYMENT_OG_URL` (env). |
| **21** | `observability/grafana-dashboards` | `codex/pr21-grafana-dashboards` | 17 | 9 dashboards JSON em `infra/grafana/dashboards/` provisionados pelo Compose. Alinhados com `14-dashboards-plan.md`. Alloy no Compose. |
| **22** | `observability/alerting` | `codex/pr22-alerting` | 21 | Grafana alerts com thresholds + windows. Sem alert fatigue. Webhook + email. Documentação de cada alerta no runbook. |
| **23** | `rag/live-evaluation` | `codex/pr23-live-evaluation` | 18 | `EVAL_LIVE=false` default. Quando `true`, runner usa embeddings/Qdrant/LLM reais. Dataset de 50-100 perguntas por piloto. CLI `yarn eval:live --company=A`. |
| **24** | `docs/consultor-ia-readme` | `codex/pr24-consultor-ia-readme` | — | Reescrever README com identidade consultor.IA. Preservar notices MIT/AnythingLLM. Atualizar CONTRIBUTING, SECURITY, TERMS. |
| **25** | `observability/sensitive-debug-mode` | `codex/pr25-sensitive-debug` | 17 | `SENSITIVE_DEBUG=false` default. Quando true: admin gate, TTL, audit log, retenção curta. ADR-009 spec. |

## Justificativa da ordem

### Por que PR 14 (runtime egress) PRIMEIRO

1. **Validador universal**: qualquer PR subsequente precisa provar que não introduziu egress não aprovado. Sem o PR 14, não temos como auditar isso objetivamente.
2. **Bloqueia o resto**: se PR 14 revelar que algo já está vazando, isso vira correção obrigatória antes do piloto. Melhor descobrir agora.
3. **Pré-requisito do PR 22 (alerting)**: alertas de egress abnormal dependem de ter o que medir.

### Por que PR 15 (vendored) logo em seguida

1. `embed/` é candidato forte a ser usado pelos sites das empresas piloto. Sem auditoria, vetor de ataque aberto.
2. `browser-extension/` é o segundo maior vetor de ataque do produto. Decidir KEEP/HARDEN/REMOVE antes de gastar tempo com hardening pesado.
3. Ambos são P0 — sem isso, piloto não sobe.

### Por que PR 17 (traceId) antes dos dashboards (PR 21)

1. Dashboards sem correlação feedback→trace perdem 50% do valor.
2. PR 17 é mudança pequena (1 coluna + popular + ler). Custo baixo, alto retorno.
3. Habilita PR 25 (sensitive debug) que precisa do trace_id.

### Por que PR 16 (admin bootstrap) é pequeno e entra cedo

1. Sem ele, subir Cliente A exige intervenção manual de 30 minutos que ninguém documenta direito.
2. Mudança pequena: `prisma/seed.js` + entrypoint no `docker-entrypoint.sh`.

### Por que PR 18 (backup/restore) é grande mas entra cedo

1. "Backup nunca restaurado não é backup." Job CI mensal é o que dá confiança.
2. Cliente A vai ter dados reais em 1 semana. Antes disso, restore testado.
3. Pós-piloto é tarde demais.

### Por que PR 19 (rate limit) entra antes dos dashboards

1. Cliente A vai expor `apiBase` publicamente. Sem rate limit, qualquer um pode tentar brute-force ou esgotar cota de LLM.
2. Mudança pequena: middleware + métricas.
3. Bloqueia P0.

### Por que PR 20+ entram junto com piloto

1. PR 20 (meta branding): cosmético, mas visível em redes sociais/Slack. Não bloqueia.
2. PR 21 (Grafana): precisa de dados reais para calibrar thresholds. Faz mais sentido entrar quando Cliente A já tem 7-15 dias de operação.
3. PR 22 (alerting): depende do PR 21.
4. PR 23 (live eval): precisa de dataset real baseado em perguntas reais do Cliente A.

### Por que PR 24+ ficam para pós-30-dias

1. PR 24 (README): não é P0/P1. Mas precisa entrar antes de abrir para contribuidores externos.
2. PR 25 (sensitive debug): só ligar se der ruim no piloto. Não construir preventivamente se ninguém pediu.

## Itens fora do roadmap desta fase (mantidos para futuro)

* Multi-tenancy (P3, pós-5 deployments)
* Kubernetes / Helm
* Multi-region
* Mobile
* Cross-company management plane
* Billing
* 25 traduções completas (priorizar en + pt_BR para piloto)
* Model router próprio
* Vector DB próprio
* Agent engine próprio
* RAG rewrite
* Backend rewrite em Go

## Métricas de "pronto para escalar além dos 3 pilotos"

Quando todos os PRs 14-23 estiverem mergeados E houver 30+ dias de operação real com Cliente A:

* restore drill mensal executado com sucesso
* live eval rodando A/B com 2 configs diferentes
* alertas sem ruído por 7 dias consecutivos
* feedback negativo < 10%
* latência P95 < 4s
* custo médio por conversa < $X (calibrar)

Se tudo isso acontecer, podemos considerar abrir para Cliente D e repensar multi-tenancy.
