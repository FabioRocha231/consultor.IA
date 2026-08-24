# 22 - Auditoria do componente `embed/`

## Resumo executivo

- Estado geral: **NECESSITA HARDENING**
- Achados críticos: 0
- Achados médios: 3
- Achados menores: 4
- Recomendação: **manter como está com ajustes**, com rebranding obrigatório antes dos pilotos, sanitização alinhada no streaming e governança para URLs configuráveis.

O `embed/` não contém SDKs de analytics, não inicializa telemetria e não envia o conteúdo da página inteira. As únicas chamadas funcionais de rede vão para o `baseApiUrl` informado no script e para o CSS derivado do mesmo host do bundle. Os problemas principais são comerciais/operacionais: branding upstream ainda aparece por padrão no bundle publicado, o caminho de streaming renderiza Markdown sem DOMPurify (embora `markdown-it` esteja com `html: false`) e atributos como `brandImageUrl`, `assistantIcon` e `sponsorLink` permitem egress para qualquer host escolhido pelo embedder.

## Branding atual

- `package.json` name: `anythingllm-embedded-chat` (`embed/package.json:2`); `private: false` (`embed/package.json:3`).
- README primeira linha: `# AnythingLLM Embedded Chat Widget` (`embed/README.md:1`).
- Strings visíveis ao usuário:
  - `sponsorText: "Powered by AnythingLLM"` e `sponsorLink: "https://anythingllm.com"` (`embed/src/hooks/useScriptAttributes.js:22-23`).
  - `assistantName: "AnythingLLM Chat Assistant"` (`embed/src/hooks/useScriptAttributes.js:25`).
  - Alt do ícone padrão: `AnythingLLM Logo` (`embed/src/components/ChatWindow/Header/index.jsx:57`).
  - Alt e fallback de nome do assistente em `PromptReply` e `HistoricalMessage` (`embed/src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx:88,93,118,123,144,153`; `embed/src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx:72,85`).
  - Página de teste: `This is an example testing page for embedded AnythingLLM.` (`embed/index.html:9`).
  - Bundle publicado em `frontend/public/embed/anythingllm-chat-widget.min.js` contém, em texto minificado, 8 ocorrências de `Anything LLM`, 6 de `AnythingLLM`, 1 de `Powered by` e 7 de `anythingllm`.

## Tabela de hosts externos observados

| Host | Arquivo:Linha | Condição | Veredito | Justificativa |
| --- | --- | --- | --- | --- |
| `{baseApiUrl}` (via `data-base-api-url`) | `embed/src/models/chatService.js:7,28,43`; `embed/src/hooks/useScriptAttributes.js:6,52-57` | GET histórico, DELETE reset e POST SSE `stream-chat`; obrigatório e sem fallback hardcoded | APROVADO | Infra consultor.IA configurada pelo embedder |
| `{stylesSrc}` (derivado de `document.currentScript.src`) | `embed/src/utils/constants.js:2-14`; `embed/src/components/Head.jsx:128` | sempre que o widget renderiza | APROVADO | Mesmo host do bundle por padrão; depende de onde o site hospeda o script |
| `https://anythingllm.com` | `embed/src/hooks/useScriptAttributes.js:23`; `embed/src/components/Sponsor/index.jsx:8` | clique no sponsor padrão, se `data-no-sponsor` e `data-sponsor-link` não forem configurados | BLOQUEADO | Domínio upstream não aprovado para os pilotos |
| `{sponsorLink}` (via `data-sponsor-link`) | `embed/src/components/Sponsor/index.jsx:8` | clique no sponsor configurado | A INVESTIGAR | Egress por clique para host arbitrário; sem allowlist |
| `{brandImageUrl}` (via `data-brand-image-url`) | `embed/src/components/ChatWindow/Header/index.jsx:56` | imagem do header quando aberto | A INVESTIGAR | Browser faz `GET` automático para URL configurada |
| `{assistantIcon}` (via `data-assistant-icon`) | `embed/src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx:92,122,152`; `HistoricalMessage/index.jsx:84` | imagem do assistente em mensagens | A INVESTIGAR | Browser faz `GET` automático para URL configurada |
| `mailto:` | `embed/src/components/ChatWindow/Header/index.jsx:153` | clique em "Email Support" | APROVADO | Cliente de e-mail local, sem rede automática |
| `github.com/Mintplex-Labs/...`, `anythingllm-embed/main/...`, `www.w3.org/...` | `embed/README.md:3,5,9,66`; `embed/src/locales/resources.js:2` | apenas documentação/comentários | APROVADO | Não fazem parte do runtime |
| `github.com/highlightjs/...`, `mths.be`, `reactjs.org/docs/error-decoder...`, `uuidjs/uuid...` | presente no bundle minificado | apenas strings de documentação/erro de bibliotecas | APROVADO | Não há chamada de rede identificada |

Não foram encontrados `WebSocket`, `XMLHttpRequest`, `sendBeacon`, `EventSource` direto, iframe remoto, `@import` externo ou fonte de CDN. O `fetchEventSource` usado no streaming é SSE para o `baseApiUrl` configurado.

## Tabela de SDKs/bibliotecas de terceiros

| Pacote | Versão | Função | Risco privacy | Notas |
| --- | --- | --- | --- | --- |
| `@microsoft/fetch-event-source` | 2.0.1 (`embed/yarn.lock:446-448`) | streaming SSE | Baixo | Chama apenas `baseApiUrl` |
| `@phosphor-icons/react` | 2.0.15 (`embed/yarn.lock:472-474`) | ícones | Baixo | Bundlado, sem CDN |
| `dompurify` | 3.0.8 (`embed/yarn.lock:1206-1208`) | sanitização HTML | Baixo | Não usado no caminho streaming |
| `he` | 1.2.0 (`embed/yarn.lock:1788-1790`) | encode HTML de código | Baixo | Sem rede |
| `highlight.js` | 11.9.0 (`embed/yarn.lock:1793-1795`) | syntax highlighting | Baixo | Core bundlado, CSS inline |
| `lodash.debounce` | 4.0.8 (`embed/yarn.lock:2203-2205`) | debounce de scroll | Baixo | Sem rede |
| `markdown-it` | 13.0.2 (`embed/yarn.lock:2232-2234`) | render Markdown | Baixo/médio | `html: false`, mas sem DOMPurify no streaming |
| `react` / `react-dom` | 18.2.0 (`embed/yarn.lock:2743-2746,2717-2720`) | UI | Baixo | Bundlado |
| `uuid` | 9.0.1 (`embed/yarn.lock:3343-3346`) | session ID | Baixo | Sem rede |
| `i18next` / `react-i18next` / `i18next-browser-languagedetector` | 23.16.8 / 14.1.3 / 7.2.2 (`embed/yarn.lock:1817-1819,2725-2728,1810-1812`) | i18n | Baixo | Detecção via localStorage/navigator, sem rede |

Nenhuma dependência de PostHog, Mixpanel, Segment, Amplitude, Sentry, Datadog, New Relic, Google Analytics, Hotjar, FullStory, LogRocket, Intercom ou Crisp foi encontrada em `embed/` ou no bundle publicado.

## Achados detalhados

### [MÉDIO] Branding upstream visível e link padrão para `anythingllm.com`

- Arquivo: `embed/src/hooks/useScriptAttributes.js:22-25`
- Descrição: o widget nasce com sponsor "Powered by AnythingLLM", link para `https://anythingllm.com` e assistente "AnythingLLM Chat Assistant". Isso expõe marca upstream e permite egress por clique para um terceiro não aprovado quando o piloto não sobrescrever as opções.
- Evidência: `rg -n -i "anythingllm|mintplex|powered by" embed` retorna 30+ ocorrências entre `package.json`, `README.md`, `index.html` e `src/`; o bundle publicado também mantém o texto minificado.
- Recomendação: renomear pacote e artefatos de build, remover o sponsor padrão upstream, trocar defaults/alt text/assets para consultor.IA, atualizar `README.md`/`index.html`, rebuildar `frontend/public/embed` e incluir smoke de marca no CI.

### [MÉDIO] Renderização streaming sem DOMPurify

- Arquivo: `embed/src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx:169-171`
- Descrição: a resposta em streaming é renderizada com `dangerouslySetInnerHTML` usando `renderMarkdown()` sem `DOMPurify.sanitize()`. O histórico usa `DOMPurify.sanitize(renderMarkdown(...))` (`embed/src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx:124-128`), então há inconsistência de defesa.
- Evidência: `markdown-it` está configurado com `html: false` (`embed/src/utils/chat/markdown.js:7`) e teste local com `markdown-it@13.0.2` mostrou HTML bruto escapado; ainda assim, o renderer custom `link_open` injeta `href` diretamente sem nova sanitização (`embed/src/utils/chat/markdown.js:60-64`) e o caminho streaming não usa a camada de DOMPurify.
- Recomendação: aplicar `DOMPurify.sanitize(renderMarkdown(...))` no mesmo ponto do histórico, adicionar teste com `<img onerror>`, `javascript:` e `data:` e manter `html: false`.

### [MÉDIO] URLs configuráveis sem validação de esquema/allowlist

- Arquivo: `embed/src/components/ChatWindow/Header/index.jsx:56`; `embed/src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx:92,122,152`; `embed/src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx:84`; `embed/src/components/Sponsor/index.jsx:8`
- Descrição: `brandImageUrl`, `assistantIcon` e `sponsorLink` podem apontar para qualquer host. Imagens são carregadas automaticamente pelo browser e podem virar tracking pixel ou vazar IP do visitante; sponsor link abre destino arbitrário.
- Evidência: os valores vêm de `document.currentScript.dataset` (`embed/src/main.jsx:11-14`) e são usados diretamente em `src`/`href` sem validação de `https:` nem allowlist.
- Recomendação: aceitar apenas URLs `https:`, documentar/restringir hosts por deployment e preferir assets self-hosted; remover o default `https://anythingllm.com`.

### [MENOR] Session ID e storage acessíveis a scripts da página

- Arquivo: `embed/src/utils/constants.js:1`; `embed/src/hooks/useOpen.js:6,10-11`; `embed/src/hooks/useSessionId.js:12-22`; `embed/src/i18n.js:21-23`
- Descrição: `localStorage` guarda `___anythingllm-chat-widget-open___`, `allm_<embedId>_session_id` e, via detector de idioma, `allm_embed_language`. O session ID permite resumir, ler e resetar uma sessão pública do chat; qualquer script da página consegue ler/forjar esse valor.
- Evidência: nenhum token/API key é armazenado; o ID é UUID v4 (`useSessionId.js:20-22`), mas funciona como credencial de sessão pública no backend de embed.
- Recomendação: documentar o embed como superfície pública, não armazenar PII nesses campos e considerar sessão opaca/assinada no servidor se houver necessidade de evitar forja.

### [MENOR] Sourcemap inline no build

- Arquivo: `embed/vite.config.js:58`
- Descrição: o build Vite gera `sourcemap: "inline"` para `dist/anythingllm-chat-widget.js`. O pipeline `build:publish` copia apenas os arquivos `.min.js`/`.min.css` para `frontend/public/embed`, e o bundle minificado atual não contém `sourceMappingURL`; ainda assim, `yarn build` deixa o bundle não-minificado com sourcemap embutido se esse artefato for servido por engano.
- Evidência: `rg -n "sourceMappingURL" frontend/public/embed/...` não retornou ocorrências; `embed/.gitignore` ignora `dist`.
- Recomendação: usar `sourcemap: false` no build de produção ou garantir que `dist/` nunca seja publicado.

### [MENOR] Pacote continua upstream e com `private: false`

- Arquivo: `embed/package.json:2-3`; `embed/vite.config.js:38,40`; `embed/package.json:10-14`
- Descrição: nome, library name, nomes de arquivo e scripts de build permanecem `anythingllm-*`. Além da marca, `private: false` permite publicação acidental no npm.
- Evidência: `embed/package.json:2` e `embed/vite.config.js:38,40`.
- Recomendação: renomear para um pacote consultor.IA, marcar `private: true` e revisar os nomes de artefatos antes de publicar.

### [MENOR] Sem documentação de CSP/CORS para o embed

- Arquivo: `embed/src/components/Head.jsx:126-128`; `embed/src/models/chatService.js:7,28,43`
- Descrição: o widget injeta `<style>` e `<link>` no documento do cliente e faz chamadas para a API; não há comentário/documento com a CSP esperada nem requisitos de CORS para os sites piloto.
- Evidência: não há menção a `Content-Security-Policy`, `connect-src`, `img-src` ou `style-src` em `embed/src`/`embed/README.md`.
- Recomendação: documentar CSP mínima (`script-src`, `style-src`, `img-src`, `connect-src`) e CORS restrito da API; adicionar um exemplo no `README.md`.

### [MENOR] Privacy gate não detecta o domínio upstream nem URLs dinâmicas

- Arquivo: `server/scripts/privacy-forbidden.json`
- Descrição: `node server/scripts/privacy-scan.mjs` retorna 0 findings, mas a lista de domínios proibidos inclui `onboarding.anythingllm.com`, `hub.anythingllm.com` e `hub.external.anythingllm.com`, não `anythingllm.com`. O gate também não valida valores dinâmicos de `data-brand-image-url`, `data-assistant-icon` ou `data-sponsor-link`.
- Evidência: `server/scripts/privacy-forbidden.json` não contém `anythingllm.com`; `server/scripts/privacy-scan.mjs` faz scan estático de texto e não simula a leitura de `dataset`.
- Recomendação: adicionar `anythingllm.com` à lista proibida e um smoke no bundle publicado que garanta ausência de marca upstream/domínios proibidos.

## Checklist de aceitação para produção

- [ ] Remover marca AnythingLLM e `https://anythingllm.com` de defaults, README, assets e bundle publicado
- [ ] Aplicar DOMPurify no caminho de streaming (`PromptReply`) e adicionar teste de sanitização
- [ ] Validar `https:` e/ou allowlist para `brandImageUrl`, `assistantIcon` e `sponsorLink`
- [ ] Definir `sourcemap: false` no build de produção
- [ ] Renomear pacote/artefatos e marcar `private: true`
- [ ] Documentar CSP mínima e CORS da API para os sites piloto
- [ ] Adicionar `anythingllm.com` e smoke de bundle ao privacy gate
- [ ] Rodar `node server/scripts/privacy-scan.mjs` com 0 findings após as mudanças
- [ ] Rebuildar `frontend/public/embed` e conferir network em página de teste: apenas `baseApiUrl` e assets do próprio domínio
- [ ] Smoke manual: abrir widget, enviar mensagem, resetar sessão e conferir ausência de qualquer host externo não aprovado

## Limitações da auditoria

- A auditoria foi estática, com leitura de código fonte e do bundle já publicado em `frontend/public/embed`.
- Não foi feito teste de rede empírico com servidor/API subidos; recomenda-se executar o runtime egress audit antes do release.
- Não foi feita auditoria do `browser-extension/`; este relatório cobre somente `embed/`.
