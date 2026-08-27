# 42 - Stack compose unificada (PR 30)

## Contexto

Antes deste PR, `docker/docker-compose.yml` tinha **3 problemas**:

1. Bloco `grafana` duplicado (resultado de merge mal resolvido entre PR 21 e PR 25) — parseava por sorte mas era ilegível.
2. Só sobia app + Postgres + Grafana. **Qdrant, Alloy, Prometheus, Loki e Tempo não estavam definidos** apesar de os arquivos de config (`infra/alloy/config.alloy`, datasources, dashboards, alertas) já existirem e apontarem para eles.
3. `postgres` estava conteinerizado — conflitava com o plano de Dokploy managed.

Este PR fecha esses 3 problemas de uma vez.

## Arquitetura final

```
DOKPLOY MANAGED (fora do compose)
└── PostgreSQL  (URL entregue via DB_URL)

COMPOSE ÚNICO (docker/docker-compose.yml)
├── anything-llm   # app principal (:3001)
├── qdrant         # vector DB (:6333 gRPC, :6334 HTTP)
├── alloy          # OTel collector (:4317 gRPC, :4318 HTTP)
├── prometheus     # métricas (:9090)
├── loki           # logs (:3100)
├── tempo          # traces (:3200 HTTP, :4318 OTLP)
└── grafana        # UI (:3000)
```

Redis: **não usado** no piloto (rate limiter in-memory). n8n: externo (Dokploy ou n8n.cloud).

## Como deployar no Dokploy

1. Criar Postgres no painel Dokploy (`Databases` → `PostgreSQL` → `Create`). Copiar a URL de conexão.
2. No painel `Projects`, criar um novo `Service` apontando para este repo / branch.
3. Em `Environment Variables`, setar:
   - `DB_URL` (a URL do Postgres do passo 1)
   - `JWT_SECRET` (>= 12 chars random)
   - `SIG_KEY`, `SIG_SALT` (>= 32 chars random cada)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (>= 12 chars)
   - `LLM_PROVIDER`, `LLM_PROVIDER_API_KEY`
   - `GRAFANA_ADMIN_PASSWORD` (trocar de `admin`!)
4. Build + Deploy. O compose sobe todos os containers, conecta no Postgres externo, app em :3001, Grafana em :3000.

## Como rodar local sem Dokploy

```bash
cd docker
cp .env.example .env
# Ajustar DB_URL para Postgres local (pode usar docker run postgres ou o
# Postgres do Dokploy via host.docker.internal)
docker compose up -d
docker compose ps   # verificar tudo healthy
```

URLs locais:
- App: <http://localhost:3001>
- Grafana: <http://localhost:3000> (admin/admin por default)
- Prometheus: <http://localhost:9090>
- Qdrant: <http://localhost:6333/dashboard>

## Configs adicionados

| Arquivo | Conteúdo |
| --- | --- |
| `infra/prometheus/prometheus.yml` | scrape_configs com job para `prometheus` self + `consultor-ia-alloy` em :4318 (métricas fluem app→OTel SDK→Alloy→Prometheus) |
| `infra/loki/local-config.yaml` | filesystem store, retention 31 dias, schema v13 |
| `infra/tempo/tempo.yaml` | OTLP HTTP receiver em :4318, backend local, retention 31 dias |

`infra/alloy/config.alloy` já existia (PR 22) e continua válido.

## Out of scope

- n8n (fica externo)
- Redis (não usado)
- Multi-tenant / multi-replica (gepeto definiu: 1 deployment = 1 empresa)
- Backup automatizado dos volumes compose (manual via Dokploy file manager por enquanto; PR futuro pra script)
- HTTPS reverse proxy na frente (Dokploy provê via Traefik ou Caddy — fora do compose)

## Rollback

`git revert <commit>`. Compose volta ao estado bugado anterior, mas app continua funcional via Dokploy managed Postgres + QDRANT_API_KEY apontando para Qdrant que Dokploy pode prover como managed também (workaround temporário).

## Referências

- HANDOFF-EMPRESA-A.md — seção "Fase Empresa A"
- docs/architecture/35-grafana-runbook.md
- docs/architecture/38-alerting-runbook.md
- infra/alloy/README.md
