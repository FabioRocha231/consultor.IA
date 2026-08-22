# ADR-000 - Zero Telemetry and Data Sovereignty

## Status

Accepted (proposal for PR 01)

## Context

O fork do AnythingLLM inclui telemetria PostHog ativa por padrão (`server/models/telemetry.js:13`, `server/models/telemetry.js:51`, `server/package.json:88`), cria `telemetry_id` em `system_settings` (`server/models/telemetry.js:71`, `server/models/systemSettings.js:71`) e envia eventos de uso. O frontend também envia survey de onboarding com PII para `onboarding.anythingllm.com` (`frontend/src/pages/OnboardingFlow/Steps/Survey/index.jsx:27`, `frontend/src/utils/constants.js:2`) e o Community Hub faz chamadas para `hub.external.anythingllm.com/v1` (`server/models/communityHub.js:11`). O requisito de produto é Zero External Telemetry.

## Decision

O consultor.IA não envia telemetria, analytics, métricas de utilização, documentos, conversas ou identificadores para o upstream AnythingLLM ou serviços de analytics externos. Removemos fisicamente o PostHog, o survey de onboarding e o Community Hub. Toda observabilidade é interna e explicitamente aprovada. Qualquer exceção futura exige nova decisão arquitetural (ADR) e aprovação explícita.

## Consequences

- Remove vazamento de dados e reduz dependências.
- Aumenta o diff com upstream no PR 01 e exige revisão em syncs.
- Elimina telemetria como "opt-out"; vira ausência estrutural.
- Permite allowlist de rede pequena e auditável.
- Algumas features upstream (Community Hub) deixam de existir no fork.

## Alternatives considered

- NoOpTelemetry adapter: mantém código morto e dependência; não garante ausência estrutural.
- `DISABLE_TELEMETRY=true` default: continua dependendo de config e de todos os sites de chamada; upstream pode inverter default; não remove survey/hub.
- Manter Community Hub ativo: contradiz allowlist e expõe tráfego externo; descartado para MVP.
