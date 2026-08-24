# ADR-012 - Backup and Disaster Recovery

## Status

Accepted

## Context

O consultor.IA mantém estado em PostgreSQL, Qdrant e no storage de documents. O gap analysis P0 #06 identificou que não existe mecanismo de backup/restore. Sem isso, um deployment destruído ou um erro operacional representa perda irreversível dos dados da empresa, e backups que nunca foram restaurados não dão confiança operacional.

## Decision

Adotar backup full via scripts bash versionados em `docker/scripts/`:

- `backup.sh` cria dump custom do Postgres, full snapshot do Qdrant via API, tar.gz do storage e `MANIFEST.json` com checksums SHA-256.
- `restore.sh` valida o backup, exige confirmação explícita, restaura Postgres, restaura coleções Qdrant via API e restaura o storage.
- Retenção default de 30 dias com limpeza automática.
- Cron diário às 03:00 UTC para RPO de 24h.
- Restore drill mensal em GitHub Actions para RTO de 4h e para garantir que o processo é reproduzível.

Para Qdrant 1.7, o backup usa full storage snapshot, mas o restore extrai os snapshots de coleção contidos no full snapshot e usa `POST /collections/{name}/snapshots/upload`. Isso contorna a ausência de recovery de full storage nessa versão e mantém o restore via API.

## Consequences

- Recuperação completa dos três componentes de estado em caso de perda do deployment.
- Restore destrutivo protegido por confirmação explícita.
- Custo de armazenamento proporcional ao tamanho dos dados e à retenção de 30 dias.
- O restore drill mensal consome alguns minutos de CI e recursos efêmeros de Postgres/Qdrant.
- O backup é full e não incremental; backups incrementais ficam para uma fase futura se o volume crescer.

## Alternatives considered

- **Barman**: excelente para PostgreSQL, mas não cobre Qdrant e storage no mesmo fluxo.
- **WAL-G/PITR**: reduz RPO para minutos, porém adiciona complexidade de infraestrutura e ainda não resolve Qdrant/storage.
- **Managed PostgreSQL backup**: reduz trabalho operacional no banco, mas depende do provedor e não cobre os outros componentes.
- **Replicação multi-region**: melhora RTO, mas adiciona custo e complexidade sem necessidade para o MVP de 3 pilotos.
- **S3 para snapshots Qdrant**: útil em escala, mas o MVP assume storage filesystem e deployment único por empresa.
