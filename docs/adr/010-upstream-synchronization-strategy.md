# ADR-010 - Upstream Synchronization Strategy

## Status

Accepted

## Context

O fork deve receber atualizações do AnythingLLM periodicamente. O runtime não pode conversar com o upstream; updates ocorrem somente no processo de desenvolvimento: fetch, diff, security review, telemetry review, merge/rebase, CI, deploy. O handoff exige Privacy CI Gate.

Historico: `embed/` e `browser-extension/` foram originalmente distribuidos como git submodules apontando para repositorios separados da Mintplex (`Mintplex-Labs/anythingllm-embed` e `Mintplex-Labs/anythingllm-extension`). Em 2026-08-22 foram absorvidos (vendored) para o parent repo, eliminando o gitlink, o `.gitmodules` e o ciclo `submodule init/update` em cada clone. Os diretorios agora sao tracked como arquivos regulares.

## Decision

Manteremos `anythingllm-upstream` como remoto e faremos syncs frequentes em branch de integração. Antes de merge: revisão de código, telemetria/privacy check, testes e build. O PR 13 adiciona CI gate com forbidden SDK/domain/import e network allowlist test. Mudanças de core devem ser pequenas, testadas e reversíveis; mudanças de produto ficam em camada própria.

Sincronizacao especifica por componente:

- `server/`, `frontend/`, `collector/`, `docker/`, `extras/`, `open-computer/`: rebasing direto contra `anythingllm-upstream`. Diff principal a revisar.
- `embed/` e `browser-extension/`: vendored. Atualizacoes do upstream Mintplex exigem re-vendoring manual: clone do repo upstream no commit alvo, copia seletiva para os diretorios locais (preservando customizacoes do consultor.IA, se houver), commit e revisao. Sem gitlink; sem submodule update automatico. Justificativa: ciclo de release independente, baixa frequencia de mudanca upstream para o piloto, e ganho de simplicidade operacional (single repo, single clone, single push). Trade-off aceito: perdemos auto-sync; ganhamos fluxo de PR unico.
- Privacy CI Gate (PR 13) varre TODO o repo, incluindo `embed/` e `browser-extension/`, garantindo que re-vendoring nao reintroduza telemetria externa.

## Consequences

- Reduz drift e conflitos.
- Cada sync tem custo de revisão.
- Gate de privacidade evita reintrodução de telemetria.
- Requer disciplina para não aceitar features upstream indesejadas.
- Vendoring de `embed/` e `browser-extension/` elimina o ciclo de submodule mas exige disciplina explicita para re-vendoring (auditar diff antes de aceitar novas versoes upstream).

## Alternatives considered

- Nunca sincronizar: drift cresce e segurança/perf ficam defasados.
- Auto-merge de upstream: risco alto de telemetria/regressão.
- Cherry-pick seletivo sem branch de sync: possível, porém mais trabalhoso e menos auditável.
- Manter `embed/` e `browser-extension/` como submodules: rege o ciclo `init/update/sync` em cada clone, conflito com workflow monorepo do consultor.IA. Descartado pela friccao operacional vs. beneficio de auto-sync (baixa frequencia de release para esses dois).
