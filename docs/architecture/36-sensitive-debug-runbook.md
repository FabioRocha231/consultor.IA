# 36 - Sensitive Debug Mode Runbook

## Objetivo

Sensitive Debug Mode permite capturar spans e payloads mais verbosos sob demanda para diagnosticar qualidade de RAG, LLM ou integrações. Ele é desligado por padrão, exige ativação por admin, expira automaticamente e aplica redação nos atributos exportados.

## Quando usar

- Incidentes de qualidade: resposta errada, chunk irrelevante, prompt/resposta com conteúdo estranho.
- Investigação de integração: payload de tool/n8n que precisa de contexto completo.
- Apenas durante incident response, com janela curta e desligamento manual após o diagnóstico.

Não use como modo normal de operação. `SENSITIVE_DEBUG=true` sozinho não ativa logs; o admin ainda precisa chamar o endpoint `enable`.

## Variáveis

| Variável | Default | Descrição |
| --- | --- | --- |
| `SENSITIVE_DEBUG` | `false` | Permite ativação por admin. Nunca ativa logs sozinho. |
| `SENSITIVE_DEBUG_TTL_MS` | `900000` | Duração da sessão de debug (15 minutos). |
| `SENSITIVE_DEBUG_RETAIN_MS` | `3600000` | Janela máxima de retenção dos spans sensíveis (1 hora). |

## Ativar

Requer um token de sessão JWT com role `admin` ou `manager`:

```bash
curl -X POST http://localhost:3001/api/admin/sensitive-debug/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Resposta esperada:

```json
{
  "configured": true,
  "enabled": true,
  "ttlMs": 900000,
  "remainingMs": 900000
}
```

Se `SENSITIVE_DEBUG` estiver `false`, o endpoint retorna `400` com `enabled: false`.

## Consultar status

```bash
curl http://localhost:3001/api/admin/sensitive-debug/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Ler logs

O audit de transições fica em:

```text
$STORAGE_DIR/sensitive-debug-audit.log
```

O arquivo rotaciona para `sensitive-debug-audit-YYYY-MM-DD.log` quando o dia muda.

Os spans com `sensitive.debug=true` são descartados se o modo já expirou. Enquanto ativo, atributos sensíveis como `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, prompts, chunks e documentos são substituídos por `[REDACTED]` antes do export.

## Desativar

```bash
curl -X POST http://localhost:3001/api/admin/sensitive-debug/disable \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

O modo também desativa sozinho após `SENSITIVE_DEBUG_TTL_MS`.

## Privacidade

- Nunca habilite em produção sem necessidade operacional justificada.
- Desligue assim que o incidente terminar.
- Trate o audit log e qualquer export OTel do período como sensível.
- Redação é aplicada no processor antes do export; não adicione payloads brutos em logs normais.
