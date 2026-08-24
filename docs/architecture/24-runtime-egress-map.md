# 24 - Runtime Egress Map

## Resumo executivo

- **Pontos diretos de `fetch()` identificados:** 76 no servidor (`server/`) e 19 no collector (`collector/`), excluindo testes, markdown, JSON, exemplos e scripts de apoio. Além disso, há chamadas indiretas via SDKs (OpenAI, Anthropic, Telegram, Chroma, Pinecone, Qdrant, Milvus, web-push, MCP SDK, transformers.js) e conexões por socket.
- **Por categoria aproximada:** LLM = 30+ pontos; Vector DB = 9 providers; Search/Agent = 14 engines + URLs arbitrárias; Collector/Storage = 19 fetch diretos + SDKs; OAuth/Identity = Outlook + Google Apps Script; Observabilidade = OTLP; n8n = 1 cliente com retry; MCP = URLs configuráveis; Push = endpoints dinâmicos das subscriptions.
- **Hosts externos hardcoded:** OpenRouter, Gemini, Groq, Mistral, Together, DeepSeek, xAI, Moonshot, Z.AI, Cerebras, SambaNova, Cohere, Perplexity, Novita, CometAPI, PPIO, Fireworks, Apipie, Gitee, ElevenLabs, Deepgram, Hugging Face, Docker Hub, GitHub raw, DuckDuckGo, Microsoft, Google Apps Script, Tailwind CDN, AnythingLLM CDN e outros.
- **Hosts via env/DB:** endpoints de LLM locais e OpenAI-compatible, Vector DB, collector, search engines, fastCRW, SearXNG, n8n, Telegram, OTLP e push subscriptions.
- **Pontos que exercitam rede em runtime:** praticamente todos os listados abaixo. O scan atual não exercita `server/utils`, `server/jobs`, `collector`, MCP, Telegram, push, sockets ou DNS.

> `embed/` e `browser-extension/` não foram mapeados neste documento; existe auditoria separada para eles.

## Tabela completa de egress points

| Categoria | Host/URL | Arquivo:Linha | Trigger | Hardcoded/Env | Sempre? | Allowlist atual | Notas |
|---|---|---|---|---|---|---|---|
| LLM | `api.openai.com` | `server/utils/AiProviders/openAi/index.js:16`, `server/utils/EmbeddingEngines/openAi/index.js:5`, `server/utils/SpeechToText/openAi/index.js:3`, `server/utils/ImageGenerators/openAi/index.js:5`, `server/utils/TextToSpeech/openAi/index.js:3` | Chat, embedding, STT, TTS, image | Env key | Quando provider ativo | `api.openai.com` | Via SDK OpenAI |
| LLM | `api.anthropic.com` | `server/utils/AiProviders/anthropic/index.js:28` | Chat/agente | Env key | Quando provider ativo | `api.anthropic.com` | Via SDK Anthropic |
| LLM | `api.groq.com` | `server/utils/helpers/customModels.js:399`, `server/utils/AiProviders/groq/index.js:17`, `server/utils/SpeechToText/groq/index.js:7`, `server/utils/agents/aibitat/providers/groq.js:20` | Chat, STT, listagem de modelos | Hardcoded | Quando provider ativo | `api.groq.com` | LLM e Whisper |
| LLM | `api.mistral.ai` | `server/utils/helpers/customModels.js:668`, `server/utils/AiProviders/mistral/index.js:18`, `server/utils/EmbeddingEngines/mistral/index.js:8`, `server/utils/agents/aibitat/providers/mistral.js:18` | Chat/embedding | Hardcoded | Quando provider ativo | `api.mistral.ai` | |
| LLM | `api.together.xyz` | `server/utils/AiProviders/togetherAi/index.js:38,87`, `server/utils/agents/aibitat/providers/togetherai.js:19` | Chat | Hardcoded | Quando provider ativo | `api.together.xyz` | |
| LLM | `api.deepseek.com` | `server/utils/helpers/customModels.js:781`, `server/utils/AiProviders/deepseek/index.js:19`, `server/utils/agents/aibitat/providers/deepseek.js:16` | Chat | Hardcoded | Quando provider ativo | `api.deepseek.com` | |
| LLM | `api.x.ai` | `server/utils/helpers/customModels.js:834`, `server/utils/AiProviders/xai/index.js:19` | Chat | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.moonshot.ai` | `server/utils/helpers/customModels.js:925`, `server/utils/AiProviders/moonshotAi/index.js:19`, `server/utils/agents/aibitat/providers/moonshotAi.js:16` | Chat | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.z.ai` | `server/utils/helpers/customModels.js:1005`, `server/utils/AiProviders/zai/index.js:17`, `server/utils/agents/aibitat/providers/zai.js:16` | Chat | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.cerebras.ai` | `server/utils/AiProviders/cerebras/index.js:20,68,265`, `server/utils/helpers/customModels.js:1248`, `server/utils/agents/aibitat/providers/cerebras.js:22` | Chat, listagem de modelos | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.sambanova.ai` | `server/utils/AiProviders/sambanova/index.js:21`, `server/utils/helpers/customModels.js:1208`, `server/utils/agents/aibitat/providers/sambanova.js:16` | Chat | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.cohere.ai` / `api.cohere.com` | `server/utils/AiProviders/cohere/index.js:20,151`, `server/utils/EmbeddingEngines/cohere/index.js:15`, `server/utils/helpers/customModels.js:976`, `server/utils/agents/aibitat/providers/cohere.js:22` | Chat, embedding, listagem | Hardcoded | Quando provider ativo | `api.cohere.ai` | `api.cohere.com` ausente |
| LLM | `generativelanguage.googleapis.com` | `server/utils/AiProviders/gemini/index.js:43,189,237`, `server/utils/EmbeddingEngines/gemini/index.js:19`, `server/utils/agents/aibitat/providers/gemini.js:20` | Chat, embedding, listagem | Hardcoded | Quando provider ativo | `generativelanguage.googleapis.com` | |
| LLM | `api.perplexity.ai` | `server/utils/AiProviders/perplexity/index.js:25` | Chat | Hardcoded | Quando provider ativo | `api.perplexity.ai` | |
| LLM | `openrouter.ai` | `server/utils/AiProviders/openRouter/index.js:37,518`, `server/utils/EmbeddingEngines/openRouter/index.js:10,103`, `server/utils/ImageGenerators/openRouter/index.js:17`, `server/utils/agents/aibitat/providers/openrouter.js:23` | Chat, embedding, image, listagem | Hardcoded | Quando provider ativo | `openrouter.ai` | Envia `HTTP-Referer: https://anythingllm.com` |
| LLM | `api.novita.ai` | `server/utils/AiProviders/novita/index.js:29,410`, `server/utils/agents/aibitat/providers/novita.js:22` | Chat, listagem | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.cometapi.com` | `server/utils/AiProviders/cometapi/index.js:29,388`, `server/utils/agents/aibitat/providers/cometapi.js:19` | Chat, listagem | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.ppinfra.com` | `server/utils/AiProviders/ppio/index.js:23,227`, `server/utils/agents/aibitat/providers/ppio.js:19` | Chat, listagem | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `api.fireworks.ai` | `server/utils/AiProviders/fireworksAi/index.js:26,217`, `server/utils/agents/aibitat/providers/fireworksai.js:19` | Chat | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `apipie.ai` | `server/utils/AiProviders/apipie/index.js:28,337`, `server/utils/agents/aibitat/providers/apipie.js:19` | Chat, listagem | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `ai.gitee.com` | `server/utils/AiProviders/giteeai/index.js:27,195`, `server/utils/agents/aibitat/providers/giteeai.js:16` | Chat, listagem | Hardcoded | Quando provider ativo | Não | Host ausente |
| LLM | `AZURE_OPENAI_ENDPOINT` | `server/utils/AiProviders/azureOpenAi/index.js:13-21`, `server/utils/EmbeddingEngines/azureOpenAi/index.js:6-15` | Chat, embedding | Env | Quando Azure ativo | `*.openai.azure.com` | Env aceita host arbitrário |
| LLM | `https://bedrock-mantle.${region}.api.aws` | `server/utils/AiProviders/bedrock/index.js:49,56`, `server/utils/helpers/customModels.js:1370`, `server/utils/agents/aibitat/providers/bedrock.js:27,40` | Chat | Hardcoded com região dinâmica | Quando Bedrock ativo | `*.amazonaws.com` não cobre `*.api.aws` | Host ausente |
| LLM | `LOCAL_AI_BASE_PATH`, `LITE_LLM_BASE_PATH`, `LMSTUDIO_BASE_PATH`, `KOBOLD_CPP_BASE_PATH`, `OLLAMA_BASE_PATH`, `TEXT_GEN_WEB_UI_BASE_PATH`, `NVIDIA_NIM_LLM_BASE_PATH`, `FOUNDRY_BASE_PATH`, `DOCKER_MODEL_RUNNER_BASE_PATH`, `LEMONADE_LLM_BASE_PATH`, `OMLX_LLM_BASE_PATH`, `PRIVATEMODE_LLM_BASE_PATH`, `GENERIC_OPEN_AI_BASE_PATH` | `server/utils/AiProviders/localAi/index.js:12-21`, `server/utils/AiProviders/liteLLM/index.js`, `server/utils/AiProviders/lmStudio/index.js:17-23`, `server/utils/AiProviders/koboldCPP/index.js:15-21`, `server/utils/AiProviders/ollama/index.js:84,151`, `server/utils/AiProviders/textGenWebUI/index.js:13-22`, `server/utils/AiProviders/nvidiaNim/index.js:12-22`, `server/utils/AiProviders/foundry/index.js:29-35`, `server/utils/AiProviders/dockerModelRunner/index.js:24-38`, `server/utils/AiProviders/lemonade/index.js`, `server/utils/AiProviders/omlx/index.js:20-29`, `server/utils/AiProviders/privatemode/index.js:20-51`, `server/utils/AiProviders/genericOpenAi/index.js` | Chat e operações do provider | Env | Quando provider ativo | `localhost`, `127.0.0.1` | Env aceita qualquer host |
| LLM | `OLLAMA_BASE_PATH` model list | `server/utils/helpers/customModels.js:515-529`, `server/utils/EmbeddingEngines/ollama/index.js:50` | Listagem/embedding | Env | Quando Ollama ativo | `localhost`, `127.0.0.1` | Env aceita host remoto |
| Vector DB | `CHROMA_ENDPOINT` | `server/utils/vectorDbProviders/chroma/index.js:68-78` | Vector store | Env, fallback `localhost:8000` | Quando Chroma ativo | `localhost`, `127.0.0.1` | Env aceita host remoto |
| Vector DB | Chroma Cloud | `server/utils/vectorDbProviders/chromacloud/index.js:30-36` | Vector store | Env | Quando chromacloud ativo | Não | Host gerenciado pelo SDK, ausente |
| Vector DB | `QDRANT_ENDPOINT` | `server/utils/vectorDbProviders/qdrant/index.js:21-25` | Vector store | Env | Quando Qdrant ativo | `qdrant.io` | Env aceita qualquer host |
| Vector DB | `WEAVIATE_ENDPOINT` | `server/utils/vectorDbProviders/weaviate/index.js:21-24` | Vector store | Env | Quando Weaviate ativo | Não | Host ausente |
| Vector DB | `MILVUS_ADDRESS` | `server/utils/vectorDbProviders/milvus/index.js:36-42` | Vector store | Env | Quando Milvus ativo | Não | Host ausente |
| Vector DB | `ZILLIZ_ENDPOINT` | `server/utils/vectorDbProviders/zilliz/index.js:18-23` | Vector store | Env | Quando Zilliz ativo | Não | Host ausente |
| Vector DB | Pinecone | `server/utils/vectorDbProviders/pinecone/index.js:20-31` | Vector store | Env | Quando Pinecone ativo | Não | Host gerenciado pelo SDK, ausente |
| Vector DB | `ASTRA_DB_ENDPOINT` | `server/utils/vectorDbProviders/astra/index.js:41-46,420` | Vector store | Env | Quando Astra ativo | Não | Fetch direto no cliente |
| Vector DB | LanceDB | `server/utils/vectorDbProviders/lance/index.js:26-40` | Vector store | Storage local | Sempre se selecionado | Não se aplica | Pode usar object store se configurado |
| Storage/Collector | Collector local | `server/utils/collectorApi/index.js:54,87,93,121,162,197,235,262,302,343` | Upload, process-link, process-file, extensions | Env `COLLECTOR_PORT`, default `0.0.0.0` | Quando collector usado | `localhost`, `127.0.0.1` | `0.0.0.0` não está na allowlist |
| Storage/Collector | Extension forwarding | `server/endpoints/extensions/index.js:25,49,68,87,105,123,142,161`, `server/jobs/sync-watched-documents.js:43,57` | Browser extension, resync | Local | Quando extension usado | `localhost`, `127.0.0.1` | Forward para collector |
| Storage/Collector | URL arbitrária | `collector/processLink/helpers/index.js:35`, `collector/processLink/convert/generic.js:221`, `collector/utils/downloadURIToFile/index.js:44` | Processar link ou arquivo | Dinâmico | Quando link é processado | Não | Risco SSRF, deve validar/controlar |
| Storage/Collector | YouTube | `collector/utils/extensions/YoutubeTranscript/YoutubeLoader/youtube-transcript.js:149-197` | Transcrição de vídeo | Hardcoded `www.youtube.com` | Quando YouTube é processado | Não | Host ausente |
| Storage/Collector | GitHub | `collector/utils/extensions/RepoLoader/GithubRepo/RepoLoader/index.js:27-66,129,219,257` | Repo loader | Hardcoded/derivado da URL | Quando usado | Não | Host ausente |
| Storage/Collector | GitLab/Gitea | `collector/utils/extensions/RepoLoader/GitlabRepo/RepoLoader/index.js:44,93,339,387`, `collector/utils/extensions/RepoLoader/GiteaRepo/RepoLoader/index.js:126,320,360` | Repo loader | Deriva do repo | Quando usado | Não | Host ausente |
| Storage/Collector | Confluence/Paperless/Drupal | `collector/utils/extensions/Confluence/ConfluenceLoader/index.js:73`, `collector/utils/extensions/PaperlessNgx/PaperlessNgxLoader/index.js:36,94`, `collector/utils/extensions/DrupalWiki/DrupalWiki/index.js:236,308` | Loaders | Base URL configurável | Quando usado | Não | Host ausente |
| Storage/Collector | Whisper local | `collector/utils/WhisperProviders/localWhisper.js:121-155` | Transcrição local | Hardcoded Hugging Face | Primeira execução sem cache | `huggingface.co` ausente | Baixa modelo via transformers.js |
| Storage/Collector | OpenAI Whisper | `collector/utils/WhisperProviders/OpenAiWhisper.js:5-21`, `collector/utils/WhisperProviders/GenericOpenAiWhisper.js:5-23` | Transcrição | Env | Quando provider ativo | `api.openai.com` para OpenAI; genérico ausente | Genérico aceita host arbitrário |
| Image | URL da imagem gerada | `server/utils/ImageGenerators/base.js:78,100,141` | Download da imagem retornada pelo provider | Dinâmico | Quando image generation usado | Não | Host arbitrário |
| Document generation | URL remota em DOCX | `server/utils/agents/aibitat/plugins/create-files/docx/utils.js:200` | Inserir imagem remota | Dinâmico | Quando agente usa | Não | Host arbitrário |
| CDN/Asset | `https://cdn.tailwindcss.com` | `server/utils/chats/exportChatToFile.js:181` | Exportar chat HTML | Hardcoded | Ao abrir o HTML exportado no browser | Não | Server não baixa; browser faz egress |
| CDN/Asset | `https://huggingface.co` / `https://cdn.anythingllm.com/support/models/` | `server/utils/EmbeddingEngines/native/index.js:37,123-160`, `server/utils/EmbeddingRerankers/native/index.js:19,50` | Embedding/reranker nativo | Hardcoded | Primeira execução sem modelo em cache | Não | Server faz download |
| Pricing/Model map | `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` | `server/utils/AiProviders/modelMap/index.js:29,107` | Boot ou cache expirado | Hardcoded | Cache ausente/stale | Não | Fetch em background |
| Pricing/Model map | `https://ai.azure.com/api/eastus/ux/v1.0/entities/crossRegion` | `server/utils/AiProviders/foundry/catalog.js:31,146` | Listar catálogo Foundry | Hardcoded | Quando catálogo é sincronizado | Não | Host ausente |
| Model catalog | `https://hub.docker.com/v2/namespaces/ai/repositories` | `server/utils/AiProviders/dockerModelRunner/index.js:347,390` | Docker Model Runner catalog | Hardcoded | Quando usado | Não | Host ausente |
| Search/Agent | `https://serpapi.com/search.json` | `server/utils/agents/aibitat/plugins/web-browsing.js:189-190` | Tool de busca | Hardcoded | Quando SerpApi configurado | Não | Host ausente |
| Search/Agent | `https://www.searchapi.io/api/v1/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:445-446` | Tool de busca | Hardcoded | Quando SearchApi configurado | Não | Host ausente |
| Search/Agent | `https://google.serper.dev/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:514` | Tool de busca | Hardcoded | Quando Serper configurado | Não | Host ausente |
| Search/Agent | `https://api.bing.microsoft.com/v7.0/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:572-582` | Tool de busca | Hardcoded | Quando Bing configurado | Não | Host ausente |
| Search/Agent | `https://qianfan.baidubce.com/v2/ai_search/web_search` | `server/utils/agents/aibitat/plugins/web-browsing.js:633-634` | Tool de busca | Hardcoded | Quando Baidu configurado | Não | Host ausente |
| Search/Agent | `https://api.serply.io/v1/search/...` | `server/utils/agents/aibitat/plugins/web-browsing.js:759-760` | Tool de busca | Hardcoded | Quando Serply configurado | Não | Host ausente |
| Search/Agent | `AGENT_SEARXNG_API_URL` | `server/utils/agents/aibitat/plugins/web-browsing.js:812-838` | Tool de busca | Env | Quando configurado | Não | Host arbitrário |
| Search/Agent | `https://api.tavily.com/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:898-899` | Tool de busca | Hardcoded | Quando Tavily configurado | Não | Host ausente |
| Search/Agent | `https://html.duckduckgo.com/html` | `server/utils/agents/aibitat/plugins/web-browsing.js:975-978` | Tool de busca | Hardcoded | Quando DDG usado | Não | Host ausente |
| Search/Agent | `https://api.exa.ai/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:1051-1052` | Tool de busca | Hardcoded | Quando Exa configurado | Não | Host ausente |
| Search/Agent | `https://api.perplexity.ai/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:1120-1121` | Tool de busca | Hardcoded | Quando Perplexity configurado | Não | `api.perplexity.ai` está na allowlist |
| Search/Agent | `https://api.search.brave.com/res/v1/web/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:1194-1217` | Tool de busca | Hardcoded | Quando Brave configurado | Não | Host ausente |
| Search/Agent | `https://fastcrw.com/api` ou `AGENT_CRW_API_URL` | `server/utils/agents/aibitat/plugins/web-browsing.js:1274-1287` | Tool de busca | Hardcoded/env | Quando fastCRW usado | Não | Env aceita self-host |
| Search/Agent | `https://ydc-index.io/v1/search` / `https://api.you.com/v1/agents/search` | `server/utils/agents/aibitat/plugins/web-browsing.js:1358-1372` | Tool de busca | Hardcoded | Quando You.com usado | Não | Host ausente |
| Search/Agent | URL arbitrária | `server/utils/agents/aibitat/plugins/web-browsing.js:760,899,1052`, `server/utils/agents/aibitat/plugins/web-scraping.js:73-120`, `server/utils/agentFlows/executors/api-call.js:42` | Navegar, scrape, API call | Dinâmico | Quando agente/flow executa | Não | SSRF relevante |
| Agent/DB | SQL connection string | `server/utils/agents/aibitat/plugins/sql-agent/SQLConnectors/MySQL.js:25`, `server/utils/agents/aibitat/plugins/sql-agent/SQLConnectors/MSSQL.js:73` | SQL agent | Configurado pelo usuário | Quando usado | Não | Conexão de banco externa |
| OAuth/Identity | `https://login.microsoftonline.com` | `server/utils/agents/aibitat/plugins/outlook/lib.js:466,605,634,709` | Outlook OAuth/token | Hardcoded | Quando Outlook configurado | Não | Host ausente |
| OAuth/Identity | `https://graph.microsoft.com/v1.0` | `server/utils/agents/aibitat/plugins/outlook/lib.js:467,886-906` | Outlook Graph | Hardcoded | Quando Outlook configurado | Não | Host ausente |
| OAuth/Identity | `https://script.google.com/macros/s/${deploymentId}/exec` | `server/utils/agents/aibitat/plugins/gmail/lib.js:330`, `server/utils/agents/aibitat/plugins/google-calendar/lib.js:126` | Gmail/Calendar via Apps Script | Hardcoded | Quando plugin configurado | Não | Host ausente |
| Agent/Tool | MCP HTTP/SSE | `server/utils/MCP/hypervisor/index.js:342-388,405-434,448-468` | MCP server configurado | URL no config | Quando MCP ativo | Não | Streamable HTTP e SSE; também executa processos stdio |
| Agent/Tool | n8n webhook | `server/integrations/n8n/client.js:139-215`, `server/integrations/n8n/tools/createLead.js:50`, `server/integrations/n8n/tools/requestHumanSupport.js:58`, `server/models/organization.js:105-116,181-189` | `createLead`, `requestHumanSupport`, futuros tools | DB `organization.n8nWebhookUrl` | Quando org configurada | `*.n8n.cloud`, `*.n8n.io` | Validação aceita qualquer http(s) |
| External comm | Telegram Bot API | `server/utils/telegramBot/index.js:89-112`, `server/jobs/handle-telegram-chat.js:25,58`, `server/utils/telegramBot/utils/media.js:11` | Telegram polling/files | Token via config | Quando Telegram ativo | Não | `api.telegram.org` não listada |
| Push | Subscription endpoint | `server/utils/PushNotifications/index.js:175-184`, `server/endpoints/webPush.js:9` | Notificação web push | Subscription do browser | Quando usuário inscrito | Não | Endpoint dinâmico |
| Observabilidade | OTLP exporter | `server/utils/observability/index.js:1-40`, `server/utils/observability/tracing.js:8-11`, `server/utils/observability/metrics.js:8-12` | Boot e runtime | `OTEL_EXPORTER_OTLP_ENDPOINT`/default do SDK | A menos que `OTEL_SDK_DISABLED=true` | Não | Intencional; host não permitido na allowlist atual |
| Telemetria | PostHog/Mixpanel/Segment/etc. | Não encontrados | - | - | - | - | Scan estático cobre e continua 0 findings |
| Jobs | `run-scheduled-job.js` | `server/jobs/run-scheduled-job.js:77-118` | Job agendado | - | Quando job roda | - | Herda todos os egress de LLM/agente/n8n |
| Jobs | `embedding-worker.js` | `server/jobs/embedding-worker.js` | Embedding em background | - | Quando job roda | - | Herda egress de embedding/vector DB |
| Jobs | `extract-memories.js` | `server/jobs/extract-memories.js` | Extração de memória | - | Quando job roda | - | Herda egress de LLM |
| Jobs | `sync-watched-documents.js` | `server/jobs/sync-watched-documents.js:43,57` | Resync extension | Collector local | Quando job roda | `localhost`, `127.0.0.1` | Collector pode abrir URL arbitrária |
| Jobs | `cleanup-*.js` | `server/jobs/cleanup-generated-files.js`, `server/jobs/cleanup-generated-images.js`, `server/jobs/cleanup-orphan-documents.js` | Cleanup | - | Quando job roda | - | Sem egress direto encontrado |

## Por categoria

### LLM Providers

O servidor suporta um grande leque de providers OpenAI-compatible. Os hardcoded estão concentrados em `server/utils/AiProviders/`, `server/utils/EmbeddingEngines/`, `server/utils/ImageGenerators/`, `server/utils/SpeechToText/`, `server/utils/TextToSpeech/` e `server/utils/helpers/customModels.js`. Providers locais (`OLLAMA_BASE_PATH`, `LMSTUDIO_BASE_PATH`, `LITE_LLM_BASE_PATH`, etc.) aceitam qualquer host via env e não devem ser considerados seguros por padrão.

### Vector DB

Providers cloud (Pinecone, Astra, Chroma Cloud, Qdrant, Milvus, Zilliz, Weaviate) fazem rede via SDK ou fetch. A allowlist só cobre `qdrant.io`, `*.amazonaws.com`, `*.googleapis.com`, `*.openai.azure.com` e hosts locais. Os demais domínios gerenciados pelos SDKs precisam ser capturados em runtime para gerar regras reais.

### Storage / Files

O collector é o maior ponto de egress dinâmico: processa links, baixa arquivos, acessa YouTube, GitHub, GitLab, Gitea, Confluence, Paperless e Drupal. O servidor também baixa imagens geradas pelo provider e imagens remotas usadas em DOCX. Isso torna o collector o alvo principal de SSRF.

### OAuth / Identity

Os fluxos encontrados são Outlook (Microsoft Identity/Graph) e Google Apps Script (Gmail/Calendar). Não há OAuth de Google/GitHub no servidor nesse mapeamento.

### Model pricing / Version / Update

Não encontrei um updater/version check tradicional. Existem três caminhos de refresh remoto de metadados: Litellm context window map, catálogo Foundry/Azure e catálogo Docker Model Runner. O ContextWindowFinder roda no boot quando o cache está ausente ou expirado.

### Background jobs / Scheduled

Os jobs herdam os providers e agentes configurados. O job de sync de watched documents faz forwarding para o collector; o job de Telegram usa a Bot API; scheduled jobs podem executar qualquer tool do agente, incluindo busca, n8n, MCP, SQL e API calls.

### Agents / Tools

`web-browsing.js` tem 14 fetch diretos e cobre 14 engines de busca, além de navegação para URLs arbitrárias. `web-scraping.js` usa o collector. O API call executor e SQL connectors também abrem conexões arbitrárias. MCP HTTP/SSE é configurável pelo usuário.

### Collector / Observability

O collector tem 19 fetch diretos e ainda usa OpenAI Whisper e transformers.js. Observabilidade é feita por OTLP exporters; não há telemetria externa proibida no servidor.

## Hosts ausentes da allowlist atual

`server/scripts/privacy-allowlist.json` só lista:

```json
api.openai.com, api.anthropic.com, api.groq.com, api.mistral.ai, api.cohere.ai,
api.together.xyz, api.deepseek.com, openrouter.ai, api.perplexity.ai,
generativelanguage.googleapis.com, qdrant.io, localhost, 127.0.0.1
*.amazonaws.com, *.googleapis.com, *.openai.azure.com, *.n8n.cloud, *.n8n.io
```

Hosts hardcoded que não estão cobertos:

- `api.x.ai`, `api.moonshot.ai`, `api.z.ai`, `api.cerebras.ai`, `api.sambanova.ai`
- `api.cohere.com`, `api.novita.ai`, `api.cometapi.com`, `api.ppinfra.com`
- `api.fireworks.ai`, `apipie.ai`, `ai.gitee.com`, `api.deepgram.com`, `api.elevenlabs.io`
- `bedrock-mantle.<region>.api.aws`, `ai.azure.com`
- `login.microsoftonline.com`, `graph.microsoft.com`, `script.google.com`
- `raw.githubusercontent.com`, `huggingface.co`, `cdn.anythingllm.com`, `cdn.tailwindcss.com`
- `hub.docker.com`, `html.duckduckgo.com`, `serpapi.com`, `www.searchapi.io`
- `google.serper.dev`, `api.bing.microsoft.com`, `qianfan.baidubce.com`, `api.serply.io`
- `api.tavily.com`, `api.exa.ai`, `api.search.brave.com`, `fastcrw.com`, `ydc-index.io`, `api.you.com`

Além disso, todos estes são dinâmicos e não cobertos por allowlist estática:

- LLM local/OpenAI-compatible via env
- Vector DB via env/SDK
- Collector e suas URLs arbitrárias
- Search engines via env (`AGENT_SEARXNG_API_URL`, `AGENT_CRW_API_URL`)
- n8n `organization.n8nWebhookUrl`
- Telegram `api.telegram.org`
- Push subscription endpoints
- OTLP endpoint
- MCP HTTP/SSE URLs
- SQL connection strings
- URLs de imagens e API calls executadas por agentes

## Pontos fracos do scan atual

O `privacy-scan.mjs --network` faz o seguinte:

1. Substitui `globalThis.fetch` e importa apenas `server/endpoints`.
2. Não importa `server/utils`, `server/jobs`, `server/integrations`, `server/utils/MCP`, `server/utils/telegramBot` nem `collector`.
3. Não exercita boot, jobs, agentes, MCP, Telegram, push, WebSocket, sockets ou DNS.
4. Não intercepta chamadas feitas por SDKs que não passam por `globalThis.fetch` no mesmo processo, nem conexões via `undici.Agent`, `net`, `tls`, child process ou bibliotecas de banco.
5. Não captura URLs dinâmicas porque não executa os fluxos que as produzem.
6. A allowlist é usada apenas para hosts já observados; hosts via env não são validados.

Por isso, um host como `api.telegram.org`, `huggingface.co`, `hub.docker.com` ou qualquer search engine pode passar no CI sem nunca ter sido exercitado.

## Recomendações para o PR 14 (runtime egress audit)

### Workloads a exercitar

- Boot: OTel exporter, ContextWindowFinder, preload de embedding/reranker nativo, patching de timeout.
- Chat: cada LLM provider, embedding, vector DB, image, STT/TTS e model listing.
- Agentes: web-browsing com todos os engines, web-scraping, API call, SQL, Outlook, Gmail, Google Calendar, n8n, MCP.
- Integrações externas: Telegram polling, envio/recebimento de mídia, push notification, extension forwarding.
- Jobs: embedding worker, extract memories, scheduled jobs, sync watched documents.
- Collector: process link, process file, download URI, YouTube, GitHub/GitLab/Gitea, Confluence, Paperless, Drupal e Whisper local/OpenAI.

### Estratégia de captura

- Patch `globalThis.fetch`, `undici.Agent`/global dispatcher, `net.Socket`, `tls.connect`, `dns.lookup`/`dns.resolve`, `child_process.spawn/exec` e `WebSocket`.
- Gravar `host`, `port`, `protocol`, stack e URL em um arquivo de evidência.
- Rodar contra um deployment de teste com credenciais falsas e proxy HTTP transparente (por exemplo, MITM proxy) para capturar o tráfego real de SDKs.
- Exercitar primeiro os caminhos sem credenciais; depois cada provider com fixture.
- Para URLs arbitrárias, testar explicitamente `localhost`, `127.0.0.1`, ranges privados e metadata cloud para detectar SSRF.

### Allowlist a complementar

- Adicionar todos os hosts hardcoded do mapa acima, preferencialmente com regras de sufixo por provider (ex.: `*.cerebras.ai`, `*.novita.ai`, `*.ppinfra.com`).
- Adicionar wildcards de regiões: `*.api.aws`, `*.azure.com`, `*.pinecone.io`, `*.datastax.com`, `*.zillizcloud.com`, `*.milvus.io`, `*.weaviate.cloud`, `*.trychroma.com`.
- Cobrir `api.telegram.org`, `huggingface.co`, `cdn.anythingllm.com`, `raw.githubusercontent.com`, `hub.docker.com`, Microsoft e Google Apps Script.
- Tratar como **opt-in** e validado por SSRF tudo que for dinâmico: collector URLs, n8n, MCP, search engines self-hosted, SQL, push e OTLP.
- Mudar a semântica de `localhost`/`127.0.0.1`: permitir somente para serviços internos conhecidos (collector, providers locais), nunca para URLs arbitrárias vindas de usuários/agentes.
