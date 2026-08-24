# Browser extension — NOT SHIPPED

Este diretório permanece no monorepo para histórico e reativação futura, mas está excluído do build do piloto Empresa A.

- Decisão: `docs/architecture/30-vendored-components-decision.md`
- PR que removeu do build: PR 28 (`codex/pr28-remove-upstream-build-dep`)
- `.dockerignore`: este diretório está listado, então o Docker build context não inclui.

Para reativar a extensão em piloto futuro: ver critérios em `docs/architecture/30-vendored-components-decision.md` (esforço estimado 15-25h).
