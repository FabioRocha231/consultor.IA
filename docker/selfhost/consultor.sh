#!/usr/bin/env bash
# consultor.IA self-host helper.
#   ./consultor.sh install   primeira instalação (gera .env e sobe tudo)
#   ./consultor.sh update    backup + nova versão
#   ./consultor.sh backup    backup manual (também roda todo dia às 03:00)
#
# install aceita respostas por variável de ambiente (instalação sem perguntas):
#   DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, LLM_PROVIDER, LLM_API_KEY, ENABLED_MODULES
set -euo pipefail
cd "$(dirname "$0")"

APP_UID=1000 # user "anythingllm" inside the app image

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_docker() {
  command -v docker >/dev/null || die "Docker não encontrado. Instale: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não encontrado."
}

# ask VAR "pergunta" [padrão] — keeps VAR if already set in the environment.
ask() {
  local var="$1" prompt="$2" default="${3:-}" answer=""
  if [ -z "${!var+x}" ]; then
    read -r -p "$prompt${default:+ [$default]}: " answer || true
    printf -v "$var" '%s' "${answer:-$default}"
  fi
}

# Hex string with 2*N chars. od reads exactly N bytes (no SIGPIPE under pipefail).
random_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

wait_ready() {
  log "Aguardando a aplicação responder (a primeira vez pode levar alguns minutos)"
  for _ in $(seq 1 60); do
    if docker compose exec -T app curl -fsS http://localhost:3001/api/ping >/dev/null 2>&1; then
      echo "Aplicação no ar."
      return 0
    fi
    sleep 5
  done
  docker compose logs --tail 50 app
  die "A aplicação não respondeu em 5 minutos."
}

schedule_backup() {
  [ -n "${CONSULTOR_SKIP_CRON:-}" ] && return 0
  if ! command -v crontab >/dev/null; then
    echo "crontab não encontrado: agende '$PWD/consultor.sh backup' manualmente."
    return 0
  fi
  local current line="0 3 * * * $PWD/consultor.sh backup >> $PWD/backup.log 2>&1"
  current="$(crontab -l 2>/dev/null || true)"
  case "$current" in
    *"$PWD/consultor.sh backup"*) ;;
    *)
      printf '%s\n%s\n' "$current" "$line" | crontab -
      echo "Backup diário agendado às 03:00 (horário do servidor)."
      ;;
  esac
}

cmd_install() {
  require_docker
  [ -f .env ] && die ".env já existe: instalação já feita. Para atualizar: ./consultor.sh update"

  ask DOMAIN "Domínio (ex.: ia.suaempresa.com.br)"
  ask ADMIN_EMAIL "E-mail do administrador"
  ask LLM_PROVIDER "Provedor de IA (openai, anthropic, gemini, deepseek)" "openai"
  local key_var
  case "$LLM_PROVIDER" in
    openai) key_var=OPEN_AI_KEY ;;
    anthropic) key_var=ANTHROPIC_API_KEY ;;
    gemini) key_var=GEMINI_API_KEY ;;
    deepseek) key_var=DEEPSEEK_API_KEY ;;
    *) die "Provedor não suportado pelo instalador: $LLM_PROVIDER (configure outros depois pelo painel)" ;;
  esac
  ask LLM_API_KEY "Chave de API do provedor"
  ask ENABLED_MODULES "Módulos extras (Enter para nenhum; restaurante: menu,orders)"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(random_hex 12)}"

  [ -n "$DOMAIN" ] || die "Domínio é obrigatório."
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "E-mail inválido: $ADMIN_EMAIL"
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || die "A senha do administrador precisa de pelo menos 12 caracteres."
  [ -n "$LLM_API_KEY" ] || die "Chave de API é obrigatória."

  local pg_password
  pg_password="$(random_hex 16)"
  log "Gerando .env"
  (
    umask 077
    cat >.env <<EOF
# Gerado por consultor.sh install em $(date -u +%Y-%m-%dT%H:%M:%SZ). Contém segredos: não compartilhe.
DOMAIN=$DOMAIN
DEPLOYMENT_OG_URL=https://$DOMAIN
ENABLED_MODULES=$ENABLED_MODULES

ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
JWT_SECRET=$(random_hex 32)
SIG_KEY=$(random_hex 32)
SIG_SALT=$(random_hex 32)

LLM_PROVIDER=$LLM_PROVIDER
$key_var=$LLM_API_KEY
EMBEDDING_ENGINE=native

SERVER_PORT=3001
STORAGE_DIR=/app/server/storage
TRUST_PROXY=1
RATE_LIMIT_ENABLED=true
DISABLE_TELEMETRY=true
SKIP_BROWSER_EXTENSION=true
OTEL_SDK_DISABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=consultor
POSTGRES_USER=consultor
POSTGRES_PASSWORD=$pg_password
DB_URL=postgresql://consultor:$pg_password@postgres:5432/consultor

VECTOR_DB=qdrant
QDRANT_ENDPOINT=http://qdrant:6333
QDRANT_URL=http://qdrant:6333

BACKUP_DIR=/var/backups/consultor-ia
BACKUP_RETENTION_DAYS=14
EOF
  )
  # The app writes UI setting changes back to .env; let its container user own it.
  if [ "$(id -u)" = 0 ]; then chown "$APP_UID:$APP_UID" .env; fi

  log "Baixando imagens"
  docker compose pull
  log "Subindo serviços"
  docker compose up -d
  wait_ready
  schedule_backup

  cat <<EOF

Pronto! Acesse https://$DOMAIN
  Login: $ADMIN_EMAIL
  Senha: $ADMIN_PASSWORD
Guarde a senha agora (ela também está em $PWD/.env).
EOF
}

cmd_backup() {
  require_docker
  log "Gerando backup"
  # root: the backup volume is root-owned in the image, the app user can't write it.
  docker compose exec -T -u 0 app bash /app/scripts/backup.sh
}

cmd_update() {
  require_docker
  [ -f .env ] || die "Instalação não encontrada (.env ausente). Rode: ./consultor.sh install"
  cmd_backup
  log "Baixando nova versão"
  docker compose pull
  docker compose up -d
  wait_ready
  docker image prune -f >/dev/null
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  backup) cmd_backup ;;
  *)
    echo "Uso: $0 {install|update|backup}"
    exit 1
    ;;
esac
