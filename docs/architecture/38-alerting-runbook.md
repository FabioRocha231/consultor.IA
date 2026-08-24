# 38 - Alerting Runbook

## Objetivo

Este runbook documenta os alertas provisionados do consultor.IA, os thresholds atuais e as ações esperadas para cada severidade. O objetivo é manter uma superfície enxuta: alertas apenas para degradação ou indisponibilidade relevante, sem ruído por requisição individual.

## Alertas provisionados

| UID | Severidade | Janela | Condição |
| --- | --- | --- | --- |
| `consultor-ia-platform-core-down` | critical | 5m | `up == 0` |
| `consultor-ia-llm-error-rate` | warning | 5m | LLM error rate > 5% |
| `consultor-ia-llm-p95-latency` | warning | 5m | LLM P95 > 5s |
| `consultor-ia-rag-fallback-spike` | warning | 5m | fallback > 50% com >= 3 fallbacks |
| `consultor-ia-cost-spike` | warning | 5m | custo diário > 2x média móvel 7d |
| `consultor-ia-disk-capacity` | critical | 5m | disco > 85% |
| `consultor-ia-document-ingestion-failures` | warning | 5m | > 3 falhas de ingestion |

Os arquivos ficam em `infra/grafana/provisioning/alerting/`. Cada alerta usa `for: 5m` e só dispara depois que a condição permanece verdadeira durante a janela.

## Ações por alerta

### Platform Health

- Sintoma: `up == 0` por 5 minutos para qualquer target monitorado.
- Verificar: `docker compose ps`, logs dos serviços, conectividade da rede interna.
- Ação: restaurar o serviço ou reiniciar o container degradado.
- Escala: se for indisponibilidade completa, tratar como incidente e acionar DR conforme runbook 33.

### LLM Errors

- Sintoma: taxa de erros LLM acima de 5% por 5 minutos.
- Verificar: dashboard `03 - LLM Performance`, métricas `llm_errors_total`, logs do provider.
- Ação: identificar provider/modelo com erro, validar quota e credenciais, reduzir retries ou trocar fallback de modelo.

### P95 Latency

- Sintoma: P95 de latência LLM acima de 5 segundos por 5 minutos.
- Verificar: dashboard `03 - LLM Performance`, métricas `llm_latency_ms_bucket`.
- Ação: checar provider, tamanho de contexto, filas e se o modelo configurado ainda atende o SLO.

### RAG Fallback Spike

- Sintoma: fallback acima de 50% das consultas RAG, com pelo menos 3 fallbacks em 5 minutos.
- Verificar: dashboard `04 - RAG Quality`, métricas `rag_fallback_total` e `rag_queries_total`.
- Ação: revisar configuração do workspace/org, qualidade dos documentos, thresholds de similaridade e mudanças recentes de ingestão.

### Cost Spike

- Sintoma: custo diário LLM acima de 2x a média móvel de 7 dias.
- Verificar: dashboard `08 - Cost`, métricas `llm_estimated_cost_usd_total`.
- Ação: identificar provider/modelo e empresa responsáveis, avaliar mudança de tráfego ou loop de retry.

### Disk Capacity

- Sintoma: filesystem monitorado acima de 85% por 5 minutos.
- Verificar: `df -h`, dashboard `01 - Platform Health`, volumes do deployment.
- Ação: limpar storage/backups antigos, aumentar volume ou mover dados para storage com capacidade adequada.

### Document Ingestion Failures

- Sintoma: mais de 3 falhas de ingestão em 5 minutos.
- Verificar: dashboard `07 - Document Ingestion`, métricas `document_ingestion_failures_total`, logs de embedding/ingestion.
- Ação: validar fonte, formato do documento, Qdrant e provider de embedding; reprocessar o lote após correção.

## Ajuste de sensibilidade

Para mudar thresholds ou janelas:

1. Edite o arquivo correspondente em `infra/grafana/provisioning/alerting/`.
2. Altere o PromQL em `data[0].model.expr` ou o valor `for`.
3. Suba ou reinicie o Grafana: `docker compose -f docker/docker-compose.yml restart grafana`.
4. Valide com os dashboards do PR 21 antes de subir o threshold em produção.

Métricas com pouco tráfego devem usar a cláusula de volume mínimo (por exemplo, `>= 3` em fallback e ingestion) para evitar alarme com uma única requisição.

## Silenciamento temporário

No Grafana, use **Alerting > Silences > New silence** para pausar um alerta por período fixo durante manutenção. Preencha o matcher pelo `uid` ou pelo `alertname` e informe o horário de término.

Alternativa permanente é adicionar `mute_time_intervals` na `notification-policies.yaml` e referenciar o intervalo na rota desejada.

## On-call

Para o piloto, manter uma rota informal:

- Primary: responsável pelo deployment no dia.
- Backup: segundo responsável para ausência ou incidente longo.
- Critical: reconhecer em até 15 minutos.
- Warning: reconhecer em até 60 minutos.

Toda resposta deve registrar o que foi verificado, a ação tomada e o follow-up no runbook ou no registro de incidentes do projeto.

## Validação

Antes de merge, validar:

```bash
docker compose -f docker/docker-compose.yml config >/dev/null
python3 -c "import yaml,sys,glob; [yaml.safe_load(open(f)) for f in glob.glob('infra/grafana/provisioning/alerting/*.yaml')]"
```

Os YAMLs usam o schema de provisioning do Grafana 11: `apiVersion: 1`, `groups`, `contactPoints` e `policies`.
