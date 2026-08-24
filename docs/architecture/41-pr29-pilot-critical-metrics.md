# PR 29 - Métricas críticas para o piloto Empresa A

## Contexto

PR 29 enxuto conforme avaliação do gepeto: fecha as métricas operacionais que
ainda estavam ausentes para acompanhar o piloto Empresa A. O PR não cria
instrumentação de LLM/RAG/agent nova (já existente), apenas HTTP, feedback e
dois alertas de operação.

## Diff

Arquivos criados:

- `server/utils/middleware/httpMetrics.js`
- `server/__tests__/middleware/httpMetrics.test.js`
- `server/__tests__/utils/observability/feedbackCounters.test.js`
- `infra/grafana/provisioning/alerting/08-n8n-failure-rate.yaml`
- `infra/grafana/provisioning/alerting/09-feedback-negative-spike.yaml`
- `docs/architecture/41-pr29-pilot-critical-metrics.md`

Arquivos editados:

- `server/index.js`
- `server/utils/observability/ai.js`
- `server/models/workspaceChats.js`
- `infra/grafana/dashboards/02-http-api.json`
- `infra/grafana/dashboards/09-company-overview.json`

## Acceptance

- Middleware HTTP registrado no boot, com `http_request_duration_seconds`
  (histograma) e `http_errors_total` (counter). Labels `method`, `route`
  normalizada e `status_class`; rotas desconhecidas viram `unmatched`.
- Counters `feedback_positive_total` e `feedback_negative_total` criados e
  chamados em `WorkspaceChats.updateFeedbackScore` após persistir o score.
- Dois alertas Grafana criados: `n8n-failure-rate` e
  `feedback-negative-spike`.
- Dashboards 02 (HTTP API) e 09 (Company Overview) com expressões reais no
  lugar dos placeholders de HTTP/feedback.

## Rollback

`git revert <commit>` restaura o estado anterior. Não há migration, dado
persistido ou mudança de CI.

## Calibragem pós-piloto

Os thresholds dos alertas são valores iniciais conservadores. Após 7-15 dias
de operação real, calibrar com os dados observados e não inventar ajustes
antes de haver evidência.
