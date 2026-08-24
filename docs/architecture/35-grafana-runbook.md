# 35 - Grafana Runbook

## Objetivo

Operar o Grafana provisionado do consultor.IA com dashboards de produto e
infraestrutura. O provisioning fica no repo, versionado como código.

## Acesso

Subir só o Grafana:

```bash
cd docker
docker compose up -d grafana
```

Abrir `http://localhost:3000`.

- Usuário: `admin`.
- Senha: variável `GRAFANA_ADMIN_PASSWORD`; default local `admin`.
- Cadastro de usuários está desabilitado via `GF_USERS_ALLOW_SIGN_UP=false`.

O provisioning é montado de:

- `infra/grafana/provisioning/datasources/`
- `infra/grafana/provisioning/dashboards/`
- `infra/grafana/dashboards/`

O provider recarrega os JSONs a cada 30 segundos. Alterações no repo aparecem
sem reiniciar o container, mas dados de dashboard salvos manualmente podem
sobrescrever o JSON se o mesmo UID existir no Grafana.

## Datasources provisionados

| Nome | UID | URL | Tipo |
| --- | --- | --- | --- |
| Prometheus | `prometheus` | `http://prometheus:9090` | métricas |
| Loki | `loki` | `http://loki:3100` | logs |
| Tempo | `tempo` | `http://tempo:3200` | traces |

Os UIDs são fixos para os dashboards referenciarem os mesmos datasources em
qualquer ambiente.

## Ajustar queries quando métricas mudarem

1. Abra o dashboard no Grafana.
2. Edite o painel e altere `expr`.
3. Valide no editor de query antes de salvar.
4. Exporte o JSON atualizado e substitua o arquivo em
   `infra/grafana/dashboards/`.
5. Prefira commits pequenos por dashboard para facilitar review.

Regras:

- Nunca inventar métrica. Se o backend não emite a métrica, deixe `TODO` no
  painel e use query placeholder.
- Nomes reais estão em `server/utils/observability/ai.js`,
  `server/utils/observability/integrations.js` e em
  `docs/architecture/11-metrics-spec.md`.
- Labels podem mudar. Antes de trocar um filtro, confirme no Prometheus com
  `{__name__=~".*llm.*"}` para ver as labels atuais.
- `organization` é o label atual nas métricas LLM/n8n. A spec alvo é
  `organization_id`; quando o runtime migrar, atualize os dashboards.

## Adicionar nova métrica

1. Implemente o instrumento no runtime com nome único, labels de baixa
   cardinalidade e unidade explícita.
2. Adicione um painel no dashboard JSON correspondente.
3. Use `rate`/`increase` para counters e `histogram_quantile` para histograms.
4. Atualize `docs/architecture/11-metrics-spec.md`.
5. Valide com:

```bash
jq empty infra/grafana/dashboards/*.json
```

## Exportar / importar dashboard

Para exportar:

1. Abra o dashboard.
2. `Share` -> `Export`.
3. Salve o JSON no arquivo correto em `infra/grafana/dashboards/`.

Para importar em outro ambiente:

1. Copie o JSON para `infra/grafana/dashboards/`.
2. Aguarde o provider recarregar (até 30s).
3. Confirme em `Dashboards -> consultor.IA`.

Se o ambiente usa UIDs diferentes de datasource, atualize `uid` no JSON ou
ajuste o provisioning para manter os UIDs fixos.

## Correlação feedback -> trace

O painel `Feedback Traces` do Company Overview usa TraceQL sobre spans com o
atributo `feedback.score`. Ele não depende do PR 17.

O PR 17 ainda não está no master neste momento. Quando estiver merged, ele
persiste `trace_id` em `workspace_chats`; a partir daí o operador pode buscar
o trace diretamente pelo ID salvo junto do feedback no banco.

## Limitações conhecidas

- O compose provisiona Grafana, mas Prometheus/Loki/Tempo não estão no
  `docker/docker-compose.yml` do PR. Os datasources assumem esses serviços na
  rede do ambiente LGTM.
- Métricas de HTTP/infra/produto listadas como `TODO` no plano não aparecem
  até o runtime emitir.
- Não há alertas no Grafana neste PR; isso entra no PR de alerting.
