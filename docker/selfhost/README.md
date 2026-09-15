# consultor.IA — instalação em VPS própria

Uma empresa, um servidor. Sobe o app, Postgres, Qdrant e Caddy (HTTPS automático).

## 1. Servidor

| | Mínimo | Recomendado |
| --- | --- | --- |
| RAM | 2 GB | 4 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disco | 20 GB | 40 GB |
| Sistema | Linux com Docker e Docker Compose v2 | Ubuntu 24.04 |

Medido: ~420 MB em repouso; ~1,1 GB depois de indexar documentos (o modelo de
embeddings local fica carregado em memória). Com 2 GB sobra pouco para picos;
se a empresa for subir muitos documentos, use 4 GB.

Instalar Docker: https://docs.docker.com/engine/install/

## 2. Domínio

Crie um registro DNS `A` apontando o domínio (ex.: `ia.suaempresa.com.br`) para
o IP do servidor. Portas **80 e 443** abertas. O certificado HTTPS é emitido
sozinho no primeiro acesso.

## 3. Instalar

```bash
git clone https://github.com/FabioRocha231/consultor.IA.git
cd consultor.IA/docker/selfhost
sudo ./consultor.sh install
```

O script pergunta domínio, e-mail do administrador, provedor de IA (openai,
anthropic, gemini ou deepseek) e a chave de API. Gera todos os segredos, sobe
tudo, agenda backup diário às 03:00 e mostra login e senha no final.

Restaurante? Responda `menu,orders` na pergunta de módulos.

Sem perguntas (automação): passe as respostas por variável:

```bash
sudo DOMAIN=ia.suaempresa.com.br ADMIN_EMAIL=dono@suaempresa.com.br \
  LLM_PROVIDER=openai LLM_API_KEY=sk-... ENABLED_MODULES= ./consultor.sh install
```

## 4. Atualizar

```bash
cd consultor.IA/docker/selfhost
git pull
sudo ./consultor.sh update
```

Faz backup, baixa a nova versão e reinicia. As migrations do banco rodam
sozinhas na subida. Se a atualização falhar, restaure o backup (seção 6).

## 5. Backup

- Automático todo dia às 03:00 (cron), mantém 14 dias.
- Manual: `sudo ./consultor.sh backup`
- Os arquivos ficam no volume do Docker. **Copie para fora do servidor** —
  se o servidor morrer, o backup morre junto:

```bash
sudo docker compose cp app:/var/backups/consultor-ia ./backups
# depois envie ./backups para outro lugar (Google Drive, S3, outro servidor)
```

## 6. Restaurar

```bash
sudo docker compose exec -u 0 app ls /var/backups/consultor-ia
sudo docker compose exec -u 0 -e RESTORE_CONFIRM=I_UNDERSTAND_THIS_WILL_OVERWRITE \
  app bash /app/scripts/restore.sh /var/backups/consultor-ia/consultor-ia-<data>.tar.gz
sudo docker compose restart app
```

Detalhes: [docs/architecture/33-backup-restore-runbook.md](../../docs/architecture/33-backup-restore-runbook.md).

## Conexões de saída

Este servidor só precisa sair para: o provedor de IA escolhido, `ghcr.io` e
Docker Hub (baixar imagens), Let's Encrypt (certificado HTTPS) e
`huggingface.co` (download único do modelo de embeddings local). WhatsApp, se
usado, fala com `graph.facebook.com`.

## Custos que a empresa paga

- Servidor e domínio.
- Uso do provedor de IA (cobrança por uso, direto com o provedor).
- WhatsApp Cloud API, se usado (Meta cobra por conversa).
