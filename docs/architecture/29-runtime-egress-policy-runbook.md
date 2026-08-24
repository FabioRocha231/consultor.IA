# 29 - Runtime Egress Policy Runbook

## Objetivo

Este runbook descreve como operar e evoluir a política de egress runtime do consultor.IA. A auditoria é uma camada de privacidade que prova que os workflows críticos não falam com hosts não autorizados.

## Como rodar localmente

Pré-requisitos:

- PostgreSQL 16 acessível.
- Qdrant acessível.
- Node 20+.
- `server/node_modules` instalado (`cd server && yarn install --frozen-lockfile`).

Suba os serviços sem usar Docker-in-Docker, por exemplo com binários nativos:

```bash
postgres -D /path/to/pgdata -p 5432
qdrant --storage-path /path/to/qdrant-storage --uri http://127.0.0.1:6333
```

Configure as variáveis apontando para os serviços:

```bash
export DB_URL="postgresql://consultor:consultor@localhost:5432/consultor"
export PRIVACY_QDRANT_URL="http://127.0.0.1:6333"
```

Rode a auditoria:

```bash
cd server
node scripts/privacy-scan.mjs --runtime --json
```

O harness cria um banco PostgreSQL isolado, roda `prisma migrate deploy`, inicia LLM stub e n8n stub locais, sobe o server com um storage temporário, executa os workflows e valida o egress. O relatório JSON também é gravado em `/tmp/privacy-runtime-report.json`.

## Como adicionar um host legítimo

1. Confirme no código ou no egress map que o host é necessário e intencional.
2. Adicione o host em `server/scripts/privacy-runtime-allowlist.json`, em `domains` ou `wildcards`.
3. Use a chave `_comment` para manter a justificativa visível no JSON.
4. Rode `node scripts/privacy-scan.mjs --runtime --json` novamente.
5. Se ainda falhar, verifique se o host observado corresponde ao que foi adicionado (normalização de DNS, porta ou wildcard).

## Como interpretar o relatório

O relatório tem:

- `workflows`: cada workflow com `status`, `duration_ms` e `details` ou `error`.
- `egress`: cada conexão capturada com `workflow`, `host`, `port`, `method`, `path`, `status` e `bytes`.
- `findings`: hosts observados que não estão na allowlist runtime.
- `ok`: `true` quando não há `findings`.

Um workflow pode ficar `error` sem bloquear a auditoria. Exemplo legítimo: `PDF upload + parsing` depende do collector e retorna erro quando o collector não está disponível no ambiente isolado. O CI falha somente se houver `findings`, ou seja, se algum host não autorizado foi observado.

## DEPLOYMENT_EGRESS_DOMAINS

`DEPLOYMENT_EGRESS_DOMAINS` é uma lista separada por vírgula que restringe os domínios autorizados de um deployment específico, complementando a allowlist de código.

Exemplo:

```bash
DEPLOYMENT_EGRESS_DOMAINS=api.openai.com,api.deepseek.com,localhost
```

Essa variável é documentada em `server/.env.example` e `docker/.env.example`. Ela não substitui um firewall; deployments produtivos devem aplicar a mesma política na borda.

## Deny-by-default na borda

Recomenda-se configurar Caddy, Traefik ou nginx como proxy reverso e aplicar uma allowlist explícita de egress para o deployment. O código do produto não deve implementar isso, porque a borda é o único ponto que garante bloqueio mesmo para bibliotecas, sockets ou DNS não cobertos pelo harness.

Exemplo conceitual com Traefik:

```yaml
http:
  middlewares:
    egress-allowlist:
      plugin:
        egress:
          allow:
            - api.openai.com
            - api.deepseek.com
```

A mesma regra deve incluir os serviços internos: Postgres, Qdrant, collector, Alloy e n8n.

## Troubleshooting

### Falso positivo: host legítimo não permitido

- Compare o host do relatório com a allowlist.
- Verifique se o egress vem de um provider ativo que deveria estar listado.
- Verifique se o DNS retorna um hostname diferente do endpoint configurado.
- Se for intencional, adicione à allowlist com justificativa.

### Host legítimo bloqueado pelo deployment

- Revise `DEPLOYMENT_EGRESS_DOMAINS` no deployment.
- Revise a regra de deny-by-default na borda.
- A allowlist runtime do código é independente da política do deployment; ambos precisam concordar.

### Harness não sobe o server

- Confirme Postgres e Qdrant estão acessíveis nas URLs configuradas.
- Confirme `prisma migrate deploy` está sendo executado pelo harness contra o banco isolado.
- Leia o output do server no erro do harness; ele é anexado à mensagem.
- Em CI, verifique os service containers e o healthcheck.
