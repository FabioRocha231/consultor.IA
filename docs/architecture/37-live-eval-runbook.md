# Live Eval Runbook

## Objetivo

O live eval mede a qualidade real do RAG usando embeddings, retrieval e LLM configurados no deployment. Ele complementa o runner mock da suíte de avaliação, que continua sendo o default e a única opção em CI.

## Quando usar

- Depois de preparar um dataset com perguntas, respostas esperadas e fontes esperadas.
- Para comparar configurações RAG antes de publicar mudanças.
- Para auditar a qualidade de um piloto antes de ampliar o uso.

## Quando NÃO usar

- Em CI: `EVAL_LIVE=true` nunca deve ser usado em pipelines automáticos.
- Em produção sem dataset preparado para a empresa/workspace.
- Quando o provider de embedding/LLM ou o Qdrant/workspace não estiver pronto.

## Requisitos

- `EVAL_LIVE=false` por padrão. O live eval só funciona com `EVAL_LIVE=true`.
- `EMBEDDING_ENGINE` ou `EMBEDDING_PROVIDER` configurado.
- `LLM_PROVIDER` configurado.
- Dataset com `company` igual ao slug do workspace usado no retrieval.
- Qdrant (ou outro vector DB configurado) com embeddings do workspace.

## Formato do dataset

Exemplo em `docs/examples/eval-dataset.example.json`:

```json
{
  "name": "Cardápio Restaurante A",
  "company": "restaurante-a",
  "questions": [
    {
      "question": "Qual o horário de funcionamento?",
      "expectedAnswer": "08h às 18h",
      "expectedSource": "cardapio.pdf",
      "tags": ["horario"]
    }
  ]
}
```

O campo `company` identifica o dataset e é usado como namespace/workspace slug no retrieval. Para um piloto, monte de 50 a 100 perguntas cobrindo os fluxos principais.

## Como rodar via CLI

```bash
cd server
EVAL_LIVE=true yarn eval:live --company=restaurante-a
EVAL_LIVE=true yarn eval:live --company=restaurante-a --config=topK=4,threshold=0.25
```

Para comparar A/B, repita `--config`:

```bash
EVAL_LIVE=true yarn eval:live --company=restaurante-a --config=topK=2 --config=topK=4
```

O CLI cria um `eval_run`, grava o audit log `rag_eval.live_run` e imprime as métricas agregadas.

## Como rodar via API

Com `EVAL_LIVE=true`:

```bash
curl -X POST /api/eval/live \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"<id>","configOverrides":{"topK":4,"similarityThreshold":0.25}}'
```

O endpoint é admin-only. Com `EVAL_LIVE=false`, retorna `403` com mensagem clara.

## Como interpretar os resultados

- `retrievalAccuracy`: proporção de perguntas em que a fonte esperada apareceu no retrieval.
- `answerCorrectness`: string match simples da resposta esperada na resposta do LLM.
- `citationCorrectness`: proporção em que a fonte esperada foi citada na resposta.
- `latencyP50Ms` e `latencyP95Ms`: latência total por pergunta.
- `totalCostUsd`: custo estimado com o snapshot de pricing local.
- `totalTokens`: tokens de entrada e saída reportados pelo provider.

## Segurança

- O live eval é opt-in e nunca roda em CI.
- A UI de live eval e o endpoint `POST /api/eval/live` são restritos a admin.
- Toda execução grava `rag_eval.live_run` em `event_logs` com `user_id`, `company`, `dataset_id`, `run_id`, `timestamp` e `cost_estimate`.
