# ADR-001 - Internal Observability Architecture

## Status

Accepted (proposal for PR 02)

## Context

O código atual usa `console`/`winston` com logs textuais (`server/utils/logger/index.js:12`), HTTP logger apenas em dev (`server/index.js:58`, `server/middleware/httpLogger.js:3`) e `event_logs` como único registro interno (`server/models/eventLogs.js:7`). Não há traces, metrics ou correlação. O handoff exige Maximum Internal Observability com OpenTelemetry, Prometheus, Loki, Tempo e Grafana, sem SaaS externo.

## Decision

Adotamos OpenTelemetry como camada de instrumentação. A aplicação emite OTLP para Grafana Alloy/OTel Collector; Alloy roteia metrics para Prometheus, logs para Loki e traces para Tempo; Grafana visualiza. Logs estruturados JSON, traces distribuídos e metrics OTel são obrigatórios. External SaaS telemetry é proibido; secrets em telemetry são proibidos; trace IDs são mandatórios; correlação n8n é desejada quando tecnicamente possível.

## Consequences

- Aplicação não conhece backends específicos; trocar backends não exige mudança na app.
- Novo custo operacional de Alloy/Prometheus/Loki/Tempo/Grafana.
- Requer disciplina de labels e redação.
- Permite diagnosticar latência/qualidade/custo por empresa.

## Alternatives considered

- Usar Prometheus direto sem OTel: cria acoplamento a backend e não cobre traces/logs.
- Usar SaaS de observabilidade: proibido pelo requisito de soberania de dados.
- Usar Loki/Tempo sem Alloy: aumenta número de integrações e configuração no app.
- OTel Collector puro: viável, mas Alloy reduz componentes quando Grafana já é o padrão.
