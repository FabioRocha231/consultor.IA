# Rate Limiting Runbook

## Objetivo

Rate limiting em memória para reduzir abuso em superfícies que disparam trabalho
caro ou são alvo de brute force. O limite é por deployment: cada réplica mantém
o próprio contador, então ele não cobre múltiplas réplicas atrás de um
load balancer.

## Limites atuais

| Rota | Limiter | Padrão |
| --- | --- | --- |
| `POST /request-token`, `GET /request-token/sso/simple` | `login` | 5 requests / 15 min |
| `POST /workspace/:slug/stream-chat` | `chat` | 30 requests / 1 min |
| `POST /workspace/:slug/thread/:threadSlug/stream-chat` | `chat` | 30 requests / 1 min |
| `POST /v1/workspace/:slug/chat` | `chat` | 30 requests / 1 min |
| `POST /v1/workspace/:slug/thread/:threadSlug/chat` | `chat` | 30 requests / 1 min |
| `POST /v1/openai/chat/completions` | `chat` | 30 requests / 1 min |
| `POST /workspace/:slug/upload`, `upload-link`, `upload-and-embed` | `upload` | 10 requests / 1 min |
| `POST /v1/document/upload`, `upload/:folderName`, `upload-link`, `raw-text` | `upload` | 10 requests / 1 min |
| `POST /browser-extension/embed-content`, `upload-content` | `upload` | 10 requests / 1 min |
| `POST /embed/:embedId/stream-chat` | `embed` | 120 requests / 1 min |
| `WS /agent-invocation/:uuid` | `agent` | 30 sockets / 1 min |

O n8n não expõe endpoint HTTP de entrada neste checkout; `RATE_LIMIT_N8N_MAX`
fica reservado para quando houver webhook inbound.

## Como ajustar via env

Todas as variáveis ficam em `server/.env.example` e `docker/.env.example`:

```text
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_CHAT_MAX=30
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_EMBED_MAX=120
RATE_LIMIT_AGENT_MAX=30
RATE_LIMIT_N8N_MAX=60
```

`RATE_LIMIT_WINDOW_MS` define o padrão para os limiters que não têm janela
própria. `RATE_LIMIT_LOGIN_WINDOW_MS` preserva a janela de login mais longa.
`RATE_LIMIT_ENABLED=false` desativa todos os limiters sem exigir restart do
processo (o `skip` é avaliado por request).

## Comportamento ao bloquear

O cliente recebe `429` com:

```json
{ "error": "rate_limited", "route": "chat" }
```

A chave do contador usa `user.id` quando o request já passou por autenticação
que expõe o usuário; caso contrário usa o IP. A métrica
`rate_limit_blocked_total` recebe os labels `route` e `key_type` (`user` ou
`ip`) e é exportada pelo pipeline OTel.

## Quando evoluir para Redis-backed

O in-memory store é suficiente para 1 deployment / 1 empresa no MVP. Ele deve
virar Redis-backed quando:

- dois ou mais servidores compartilharem o mesmo domínio;
- o limite precisar ser compartilhado entre réplicas;
- os pilotos mostrarem distribuição de IP atrás de proxy onde `request.ip`
  deixa de ser confiável.

Não usar cache distribuído antes disso; adiciona dependência operacional sem
benefício mensurável.
