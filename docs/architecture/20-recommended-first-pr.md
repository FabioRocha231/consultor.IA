# 20 - Recommended First PR

## Por que PR 01 (privacy/remove-upstream-telemetry)

1. **Requisito não negociável**: Zero External Telemetry é P0 no handoff.
2. **Bloqueia tudo**: enquanto PostHog, survey e Community Hub existem, qualquer teste de rede ou observabilidade interna contamina a auditoria.
3. **Reduz superfície**: remove dependência, PII e chamadas outbound antes de instrumentar com OTel.
4. **Difícil de adiar**: upstream pode mudar; quanto mais tarde, maior o diff.
5. **Preparação para PR 02/13**: PR 02 assume allowlist limpa; PR 13 valida que a remoção permanece.

## O que entra no PR 01

- Remover `posthog-node` de `server/package.json` e lockfile.
- Remover `server/models/telemetry.js`, `server/utils/telemetry/index.js` e chamadas `Telemetry.*`.
- Remover `telemetry_id` de `system_settings.supportedFields` e migration para drop (ou deixar valor órfão se preferir migration menor; recomendo drop com backup).
- Remover frontend Privacy/Telemetry toggle e links.
- Remover survey de onboarding (`frontend/src/pages/OnboardingFlow/Steps/Survey`, `frontend/src/utils/constants.js`) e endpoint de onboarding survey.
- Remover Community Hub (endpoints, model, frontend pages/routes e sidebar).
- Atualizar README/TERMS/env docs.
- Adicionar script de verificação estática mínima (`rg -i 'posthog|anythingllm.com'`) em CI ou PR 13; mínimo: checklist manual no PR.

## Acceptance criteria

- `rg -i -n 'posthog|telemetry|onboarding.anythingllm|hub.anythingllm|hub.external.anythingllm' server frontend/src collector docker README.md TERMS_SELF_HOSTED.md` retorna sem hits em código funcional (exceto histórico git).
- `yarn lint:ci` passa.
- `yarn test` passa (mocks de Telemetry atualizados).
- Build do frontend passa.
- Boot sem erro com `NODE_ENV=production` e sem variáveis de telemetria.
- Não há nenhuma chamada outbound para PostHog/onboarding/hub durante smoke de startup/login/chat/upload.

## O que NÃO entra

- Não adiciona OTel (PR 02).
- Não faz rebrand completo (PR 03).
- Não mexe em core de chat/RAG/agents.
- Não adiciona n8n.
- Não cria Organization.
- Não implementa Privacy CI gate completo (PR 13), apenas a remoção e checklist/script básico.

## Files alvo (lista representativa, exata no PR)

- `server/package.json`, `server/yarn.lock`
- `server/models/telemetry.js`, `server/utils/telemetry/index.js`
- `server/utils/boot/index.js`
- `server/models/systemSettings.js`
- `server/utils/helpers/updateENV.js`
- ~25 arquivos com `Telemetry.sendTelemetry` em `server/endpoints/`, `server/models/`, `server/utils/`, `server/jobs/`
- `server/endpoints/communityHub.js`, `server/models/communityHub.js`, `server/utils/middleware/communityHubDownloadsEnabled.js`
- `frontend/src/pages/OnboardingFlow/Steps/Survey/index.jsx`
- `frontend/src/utils/constants.js`
- `frontend/src/pages/GeneralSettings/PrivacyAndData/index.jsx`
- `frontend/src/components/SettingsSidebar/index.jsx`
- `frontend/src/pages/GeneralSettings/CommunityHub/**`, `frontend/src/models/communityHub.js`
- `frontend/src/main.jsx`
- `README.md`, `TERMS_SELF_HOSTED.md`
- `server/.env.example`, `docker/.env.example`

## Rollback

- Reverter o PR via git; sem migração de dados não reversível (dropar `telemetry_id` com backup ou deixar coluna órfã).
- Nenhum contrato de API usado pelo produto depende dos endpoints removidos.
