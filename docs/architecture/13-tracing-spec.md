# 13 - Distributed Tracing Specification

## IDs

| ID | Origem | Obrigatório |
| --- | --- | --- |
| `trace_id` | OTel W3C | SIM |
| `span_id` | OTel | SIM |
| `request_id` | app UUID | SIM |
| `conversation_id` | thread/chat | SIM (quando aplicável) |
| `organization_id` | deployment/org | SIM |

## Root span: chat

```text
POST /api/workspace/:slug/stream-chat
├── auth
├── conversation.load
├── embedding.generate
├── qdrant.search
├── rag.context.build
├── llm.generate
└── stream.response
```

## RAG span attributes

| Attribute | Valor |
| --- | --- |
| `rag.namespace` | workspace.slug |
| `rag.top_n` | workspace.topN |
| `rag.similarity_threshold` | workspace.similarityThreshold |
| `rag.vector_search_mode` | default/re-rank |
| `rag.chunks_found` | count |
| `rag.best_score` | best |
| `rag.no_results` | bool |
| `rag.fallback_type` | dont_know/human_handoff/general_llm |

## Agent span tree

```text
chat.request
├── rag
├── agent.reasoning
├── tool.createLead
│   └── n8n.webhook
│       └── crm
└── llm.final_response
```

## LLM span attributes

| Attribute | Valor |
| --- | --- |
| `llm.provider` | provider |
| `llm.model` | model |
| `llm.input_tokens` | tokens |
| `llm.output_tokens` | tokens |
| `llm.ttft_ms` | time to first token |
| `llm.duration_ms` | duration |
| `llm.estimated_cost_usd` | cost |

## Propagação

- HTTP: W3C `traceparent`.
- n8n: `correlation_id` + `traceparent` quando possível.
- Logs: `trace_id`, `span_id`, `request_id`, `conversation_id`, `organization_id`.
- Frontend: gerar `request_id` e propagar via header `x-request-id`; OTel Web opcional.

## Diagnóstico obrigatório

Cenário "Empresa B lenta às 15:32":

```text
trace_id: abc123
request.total                 5.821 ms
  auth                           3 ms
  embedding                    108 ms
  qdrant                        31 ms
  rag.build                     12 ms
  llm                          847 ms
  agent.tool                 4.703 ms
    n8n                      4.681 ms
      crm                    4.522 ms
```

Conclusão: gargalo no CRM via n8n.

## Sensitive spans

- Spans com prompts/chunks/respostas **não** são criados por padrão.
- Sensitive Debug Mode cria spans `debug.llm`/`debug.rag` com payloads, desligado por padrão e retenção curta.
