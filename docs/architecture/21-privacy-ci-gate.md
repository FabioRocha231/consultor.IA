# 21 - Privacy CI Gate

O gate do PR 13 protege o consultor.IA contra reintrodução de telemetria externa, analytics ou outbound não autorizado vindo de syncs e dependências novas.

## Checks

- `static-privacy-check`: varre o repositório (menos docs, builds, vendoring interno e listas do próprio gate) por domínios proibidos, SDKs/imports proibidos, env vars de telemetria e headers sensíveis em logs.
- `network-privacy-check`: com o fetch interceptado por stub, importa os módulos de `server/endpoints/`, registra qualquer tentativa outbound e compara o host com a allowlist. Não faz requisição de rede real.
- `dependency-audit`: roda `yarn audit --groups dependencies --level high` e reporta o resultado sem falhar o PR neste momento.

## Como debugar uma falha

Reproduza o check localmente:

```bash
cd server
node scripts/privacy-scan.mjs --json
node scripts/privacy-scan.mjs --network --json
```

O output JSON lista `file`, `line` e `pattern` de cada finding. As categorias mais comuns:

- `domain:<host>`: o host está em `privacy-forbidden.json` e deve ser removido do código.
- `npm_package:<pacote>` ou `package_dependency:<pacote>`: o pacote está em `privacy-forbidden.json` e não pode ser adicionado.
- `env_var:<prefixo>`: o código usa uma env var de telemetria bloqueada.
- `header_in_log`: um header sensível aparece em uma chamada de log.
- `network:<host>`: o import smoke tentou acessar um host fora da allowlist.
- `network:import_failed`: um endpoint falhou ao importar; corrija o erro antes de avaliar privacy.

Para um host novo legítimo, altere `server/scripts/privacy-allowlist.json` somente se a integração for funcional e explicitamente autorizada. Para um SDK/domínio proibido, não adicione à allowlist; remova o código ou o pacote. Qualquer exceção de telemetria exige ADR e aprovação, como definido em ADR-000.

O network check usa um `STORAGE_DIR` temporário com cache de pricing para o import não depender de rede. Se um endpoint fizer fetch durante o import, o host aparece em `attempts` no output JSON.
