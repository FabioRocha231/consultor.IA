# 33 - Backup and Restore Runbook

## Objetivo

Este runbook cobre backup full e restore do consultor.IA para os três componentes de estado: PostgreSQL, Qdrant e storage de documentos. O princípio operacional é: **backup nunca restaurado não é backup**. Por isso o repositório inclui um restore drill mensal em CI.

## Requisitos

- `pg_dump`, `pg_restore` e `psql`
- `curl`, `tar`, `sha256sum` e `jq`
- Acesso ao `POSTGRES_HOST`, `QDRANT_URL` e `STORAGE_DIR` do deployment

Na imagem Docker do consultor.IA os scripts ficam em `/app/scripts/`. Em um runner Linux, use `docker/scripts/` direto.

## Variáveis

| Variável | Default | Descrição |
| --- | --- | --- |
| `BACKUP_DIR` | `/tmp/consultor-ia-backup` | Diretório de saída dos backups |
| `BACKUP_RETENTION_DAYS` | `30` | Retenção em dias |
| `POSTGRES_HOST` | `localhost` | Host PostgreSQL |
| `POSTGRES_PORT` | `5432` | Porta PostgreSQL |
| `POSTGRES_DB` | `consultor` | Database PostgreSQL |
| `POSTGRES_USER` | `consultor` | Usuário PostgreSQL |
| `POSTGRES_PASSWORD` | vazio | Senha PostgreSQL, nunca logada |
| `QDRANT_URL` | `http://localhost:6333` | Base URL do Qdrant |
| `QDRANT_API_KEY` | vazio | API key opcional do Qdrant |
| `STORAGE_DIR` | `/app/server/storage` | Diretório de documents do app |
| `RESTORE_CONFIRM` | vazio | Confirmação explícita de restore |

O script lê `.env` do diretório atual, `docker/.env` ou o `.env` ao lado de `docker/scripts`, mas variáveis de ambiente têm precedência.

## Backup manual

Dentro do container:

```bash
docker compose exec anything-llm bash /app/scripts/backup.sh
```

Em um host Linux com as ferramentas instaladas:

```bash
BACKUP_DIR=/var/backups/consultor-ia \
POSTGRES_HOST=localhost \
POSTGRES_DB=consultor \
POSTGRES_USER=consultor \
QDRANT_URL=http://localhost:6333 \
STORAGE_DIR=/app/server/storage \
bash docker/scripts/backup.sh
```

O script cria:

- `postgres.dump` em formato custom do `pg_dump`
- `qdrant.snapshot` gerado por `POST /snapshots` do Qdrant
- `storage.tar.gz` com o conteúdo de `STORAGE_DIR`
- `MANIFEST.json` com timestamp, versões, tamanhos e SHA-256
- `consultor-ia-<UTC-ISO>.tar.gz` contendo todos os artefatos

## Restore manual

Restore é destrutivo. O script exige `RESTORE_CONFIRM=I_UNDERSTAND_THIS_WILL_OVERWRITE` ou `--yes`.

Dentro do container:

```bash
docker compose exec -e RESTORE_CONFIRM=I_UNDERSTAND_THIS_WILL_OVERWRITE \
  anything-llm bash /app/scripts/restore.sh \
  /var/backups/consultor-ia/consultor-ia-20260824T000000Z.tar.gz
```

Em um host Linux:

```bash
RESTORE_CONFIRM=I_UNDERSTAND_THIS_WILL_OVERWRITE \
  bash docker/scripts/restore.sh --yes \
  /var/backups/consultor-ia/consultor-ia-20260824T000000Z.tar.gz
```

O restore valida o tar.gz e os checksums, faz drop/create do database PostgreSQL, restaura o dump, restaura as coleções Qdrant via API de upload de snapshot e substitui o storage atual mantendo um `.bak.<timestamp>`.

## Cron sugerido

Backup diário às 03:00 UTC:

```cron
0 3 * * * docker compose exec -T anything-llm bash /app/scripts/backup.sh >> /var/log/consultor-ia-backup.log 2>&1
```

## RPO e RTO

- **RPO: 24h**: backup full diário; a perda máxima aceita é o dia corrente.
- **RTO: 4h**: inclui provisionamento do deployment, restore dos três componentes, smoke E2E e retorno aos usuários.

## Cenário de DR

1. Detecte perda total do deployment.
2. Provisione novo PostgreSQL, Qdrant e container consultor.IA.
3. Monte o diretório de backups no mesmo caminho do deployment antigo.
4. Rode as migrations até o mesmo estado do backup e execute `restore.sh`.
5. Rode o smoke E2E: login, abertura de workspace, chat, feedback e dashboard.
6. Confirme contagem de workspaces/chats/documents e pontos do Qdrant.

## Restore drill CI

O workflow `.github/workflows/backup-restore-drill.yaml` roda mensalmente e via `workflow_dispatch`. Ele:

1. Sobe PostgreSQL 16 e Qdrant 1.7 efêmeros.
2. Aplica migrations Prisma.
3. Cria dados de smoke em Postgres, Qdrant e storage.
4. Executa `backup.sh`.
5. Reinicia os serviços.
6. Executa `restore.sh` com confirmação.
7. Valida contagens e sobe um relatório como artifact.

## Limitação conhecida

Qdrant 1.7 não expõe recovery de full storage snapshot via API. O `backup.sh` gera o full snapshot e o `restore.sh` extrai os snapshots aninhados do `qdrant.snapshot` e restaura cada coleção pelo endpoint `POST /collections/{name}/snapshots/upload`. Essa limitação deve ser revisada quando o deployment usar uma versão do Qdrant com full storage recovery.
