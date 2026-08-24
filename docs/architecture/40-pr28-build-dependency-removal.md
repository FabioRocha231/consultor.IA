# PR 28 - Remoção da dependência de build upstream

## Contexto

O build ARM64 do consultor.IA baixava o Chromium de
`https://webassets.anythingllm.com/chromium-1088-linux-arm64.zip`, sem checksum e dependendo da
infraestrutura Mintplex/AnythingLLM mesmo fora do runtime. Como Zero External Telemetry vale também
para build-time, o download foi substituído por um mirror pinado e verificado.

## Diff resumido

- `docker/Dockerfile` e `cloud-deployments/openshift/Dockerfile`: Chromium ARM64 passa a ser baixado
  de `CHROMIUM_BASE_URL/${CHROMIUM_BUILD_ID}/chromium-linux-arm64.zip`, com `sha256sum -c` fail-closed.
- `docker/scripts/chromium-arm64.env`: pin real com `CHROMIUM_BASE_URL`, `CHROMIUM_BUILD_ID` e
  `CHROMIUM_SHA256`.
- `.dockerignore`: `browser-extension/` sai do build context.
- `docker/.env.example`: `SKIP_BROWSER_EXTENSION=true` documentado.
- `browser-extension/DEPRECATED.md`: registro de exclusão do build e reativação futura.
- Entrypoints Docker e OpenShift: link residual `docs.anythingllm.com` substituído por referência
  interna `docs/architecture/31-admin-bootstrap-runbook.md`.

## Valores pinados

```bash
CHROMIUM_BASE_URL=https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium
CHROMIUM_BUILD_ID=1234
CHROMIUM_SHA256=b5ad7d8fe70f230b34198ddb5626d717c016db2f627cb44b922babbcaf3479b9
```

Origem: Playwright v1.62.1 (`browsers.json`). O mirror Google
`chromium-browser-snapshots/Linux_ARM64/LAST_CHANGE` retornou 404 em 2026-08-24.

## Plano de rollback

`git revert <commit>` restaura os Dockerfiles, `.dockerignore`, entrypoints e `docker/.env.example`.
O arquivo `docker/scripts/chromium-arm64.env` e os docs novos ficam órfãos no repositório se o revert
for feito por commit único; podem ser removidos no mesmo PR ou mantidos como documentação. Não há
migration nem impacto em runtime.

## Como atualizar o BUILD_ID

```bash
curl -fsSL https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/packages/playwright-core/browsers.json
# usar a revision do bloco "chromium"
curl -fsSL "https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/<id>/chromium-linux-arm64.zip" -o /tmp/c.zip
sha256sum /tmp/c.zip
# editar docker/scripts/chromium-arm64.env com os novos valores
# abrir PR separado, bump minor
```

## Referências

- Decisão de browser-extension: `docs/architecture/30-vendored-components-decision.md`
- Runbook operacional: `docs/architecture/29-runtime-egress-policy-runbook.md`
