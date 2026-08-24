# 23 - Auditoria do componente `browser-extension/`

## Resumo executivo

- Estado geral: **NECESSITA HARDENING**
- Recomendação: **REMOVER do build do piloto**; se o recurso for necessário, fazer fork + rebrand + permission cut antes de publicar.
- Justificativa: o componente ainda é a extensão upstream da Mintplex, com branding AnythingLLM, `<all_urls>` no manifest e uma entrada de auto-connect via `window.postMessage` sem validação de origem. Para 3 empresas piloto, o valor do recurso é baixo frente ao custo de hardening e ao risco de vazar conteúdo de páginas para um `apiBase` indevido.

## Branding atual

- Manifest name: `AnythingLLM Browser Companion` em `browser-extension/public/manifest.json:3`.
- Manifest description: ainda fala em AnythingLLM em `browser-extension/public/manifest.json:5`.
- README primeira linha: `# AnythingLLM Chrome Extension` em `browser-extension/README.md:1`.
- Diretório `media/`: contém `anything-llm.png` em `browser-extension/src/media/anything-llm.png`, usado como logo default no popup em `browser-extension/src/hooks/useApiConnection.js:2` e em `browser-extension/src/App.jsx:9`.
- Ícones `public/icon{16,32,48,128}.png` ainda são do pacote upstream; não há substituição por marca consultor.IA.
- `package.json` ainda usa `name: anything-llm-extension` em `browser-extension/package.json:2`.
- `index.html` ainda usa `<title>AnythingLLM Document Saver</title>` em `browser-extension/index.html:6`.
- `LICENSE` ainda declara `Mintplex Labs Inc.` em `browser-extension/LICENSE:3`.
- Não existe campo `author` no manifest.

## Permissions analysis

| Permission | Default no upstream | Justificável para piloto? | Recomendação |
| --- | --- | --- | --- |
| `contextMenus` | Sim | Sim | Manter se o recurso for mantido; usado em `browser-extension/public/background.js:2-59`. |
| `activeTab` | Sim | Sim | Não é usado hoje, mas é a melhor alternativa para capturar a aba apenas quando o usuário clicar no menu de contexto. Remover enquanto não houver esse fluxo. |
| `storage` | Sim | Sim | Necessária para `apiBase`/`apiKey`, mas usar `chrome.storage.local` em vez de `sync` para reduzir propagação de segredo entre dispositivos. |
| `notifications` | Sim | Não | `chrome.notifications` não é usado; o código usa badge do action em `browser-extension/public/background.js:271-281`. Remover. |
| `alarms` | Sim | Sim, com ajuste | Usada para poll de workspaces em `browser-extension/public/background.js:379-385`; reduzir frequência ou tornar manual. |
| `scripting` | Não declarado | N/A | Não usado. Se trocar `<all_urls>` por `activeTab`, pode ser necessário para injeção programática, dependendo da implementação final. |
| `webRequest` | Não declarado | N/A | Não usado; não adicionar. |
| `tabs` | Não declarado | N/A | Não usado; não adicionar. |

## host_permissions analysis

- `<all_urls>` está presente em `browser-extension/public/manifest.json:19-20` para `host_permissions` e em `browser-extension/public/manifest.json:34-41` para `content_scripts.matches`.
- É usado para o `contentScript.js` conseguir ler `document.body.innerText` de qualquer página e para o service worker fazer `fetch` para um `apiBase` arbitrário.
- Para o piloto, `<all_urls>` não é justificável: a captura de página só ocorre por ação explícita do usuário via menu de contexto. Uma alternativa é `activeTab` para capturar a aba ativa + `optional_host_permissions` para o domínio do servidor consultor.IA; outra é restringir `content_scripts.matches` aos domínios das 3 empresas piloto.
- O `apiBase` é configurado pelo usuário e não tem validação de origem ou de esquema HTTP(S); o `<all_urls>` vira uma permissão global para conectar a qualquer host.

## Network calls observados

| Destino | Arquivo:Linha | Condição | Veredito | Justificativa |
| --- | --- | --- | --- | --- |
| `${apiBase}/ping` | `browser-extension/src/models/browserExtension.js:17-26` | Popup abre ou usuário conecta | Aceitável | Necessário para health check; validar esquema HTTPS e origem. |
| `${apiBase}/browser-extension/check` | `browser-extension/src/models/browserExtension.js:2-14`, `browser-extension/public/background.js:75-90`, `browser-extension/public/background.js:102-113` | Conectar, validar key e poll periódico | Aceitável | Necessário para autenticar e listar workspaces. |
| `${apiBase}/browser-extension/upload-content` | `browser-extension/public/background.js:127-143`, `browser-extension/public/background.js:183-200` | Salvar seleção ou página inteira | Aceitável sob hardening | Envia conteúdo capturado para o servidor configurado; precisa proteger contra `apiBase` malicioso. |
| `${apiBase}/browser-extension/embed-content` | `browser-extension/public/background.js:156-171`, `browser-extension/public/background.js:217-233` | Embed de seleção ou página em workspace | Aceitável sob hardening | Mesmo risco de vazamento do upload. |
| `${apiBase}/system/logo` | `browser-extension/src/models/browserExtension.js:29-47` | Popup abre | Aceitável | Apenas logo; sem `Authorization`. |
| `${apiBase}/browser-extension/disconnect` | `browser-extension/src/models/browserExtension.js:49-65` | Usuário desconecta | Necessita correção | Existe bug de referência a `errorData`; além disso, o fluxo normal de desconexão local não revoga a key. |
| `chrome.runtime.sendMessage` | `browser-extension/public/contentScript.js:3-6`, `browser-extension/src/hooks/useApiConnection.js:19-24`, `browser-extension/src/components/Config.jsx:22,49`, `browser-extension/public/background.js:289-300` | Comunicação entre content script, popup e service worker | Aceitável | Tráfego interno, mas origem do `postMessage` precisa ser validada. |
| `chromewebstore.google.com` e `storage.googleapis.com` | `browser-extension/README.md:30-32` | Somente documentação | Risco de branding | Aponta para a listagem oficial da Mintplex, não para a extensão consultor.IA. |

Não há `apiBase` hardcoded nem fallback de rede fixo para Mintplex ou outro host. Todos os `fetch` usam o `apiBase` salvo pelo usuário.

## Page content handling

- Seleção de texto: capturada pelo `contextMenus.onClicked` e enviada como `info.selectionText` em `browser-extension/public/background.js:316-330`.
- Página inteira: `getPageContent` pede ao content script e ele retorna `document.body.innerText` em `browser-extension/public/background.js:302-314` e `browser-extension/public/contentScript.js:10-13`.
- O envio é JSON com `textContent` e `metadata: { title, url }` para os endpoints `upload-content`/`embed-content`.
- Não há sanitização local, limitação de tamanho, confirmação do destino antes do envio, nem redação de campos sensíveis. `document.body.innerText` pode conter dados pessoais visíveis na página.
- Não há captura automática por timer; o conteúdo só é lido após ação do usuário no menu de contexto. Porém, o content script roda em todas as páginas e qualquer página pode solicitar troca do `apiBase`, o que anula a proteção de "ação explícita".

## Storage/credentials

- `apiBase` e `apiKey` são salvos em `chrome.storage.sync` em `browser-extension/src/components/Config.jsx:45-46` e `browser-extension/public/background.js:292-297`.
- A extensão não aplica criptografia própria; `chrome.storage.sync` pode sincronizar a chave entre navegadores logados na mesma conta.
- No servidor, a chave `brx-*` é armazenada em texto puro na tabela `browser_extension_api_keys` em `server/models/browserExtensionApiKey.js:20-27`.
- O fluxo de auto-connect passa a connection string pela página por `window.postMessage(..., "*")` em `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/NewBrowserExtensionApiKeyModal/index.jsx:32-34` e `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/BrowserExtensionApiKeyRow/index.jsx:49-52`.

## Telemetry/analytics

- Nenhum SDK de analytics, telemetria, Sentry, Segment, PostHog ou endpoint remoto da Mintplex foi encontrado no código da extensão.
- `console.error` existe para depuração, mas não envia dados externamente.
- Não há update server hardcoded; o `README.md` apenas referencia a listagem da Chrome Web Store da Mintplex.

## Build pipeline

- `package.json` define `vite build && cp public/background.js dist/` em `browser-extension/package.json:7-8`.
- O `dist/` é ignorado por `browser-extension/.gitignore:11`.
- O `yarn.lock` existe no diretório, mas é ignorado pelo `.gitignore` raiz em `.gitignore:10`, então não é versionado e a build não é reproduzível a partir de lockfile no CI.
- `vite.config.js` não habilita `sourcemap`; por padrão a build não deve emitir sourcemaps, mas não foi gerada uma build para confirmar o artefato final.
- Não rodei `yarn audit` porque `yarn` não está disponível neste ambiente e o lockfile não é versionado; a verificação de vulnerabilidades fica como `[NÃO VERIFICADO]`.

## Update mechanism

- Não há update server próprio nem serviço de update no código.
- Se publicada no Chrome Web Store, a atualização seguirá o mecanismo da loja. O README atual aponta para a extensão upstream da Mintplex, então distribuir o piloto pela listagem existente não entregaria a versão consultor.IA.

## Risco de supply chain

- Dependências são poucas e de ecossistema conhecido: React 18, React DOM, Vite 5, Tailwind 3, PostCSS, Autoprefixer, Prettier, Nodemon e plugins oficiais em `browser-extension/package.json:12-25`.
- O risco principal é reprodutibilidade: sem lockfile versionado, cada build pode resolver versões diferentes das faixas `^` declaradas.
- Auditoria de CVEs não executada neste turno (`yarn` indisponível); registrar como pendência antes de publicar qualquer versão.

## Achados detalhados

### [CRÍTICO] Qualquer página pode trocar `apiBase`/`apiKey` da extensão

- `browser-extension/public/contentScript.js:1-7` escuta qualquer `window.message` com tipo `NEW_BROWSER_EXTENSION_CONNECTION` e repassa a connection string ao background sem validar `event.origin`, `event.source` ou formato.
- `browser-extension/public/background.js:292-297` grava `apiBase`/`apiKey` recebidos sem validação de origem.
- Qualquer site visitado pode sobrescrever a configuração para um servidor controlado pelo atacante. A partir daí, ações futuras de "salvar página/trecho" podem enviar conteúdo e Bearer key para esse servidor.
- O frontend legitimo também usa `window.postMessage(..., "*")` em `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/NewBrowserExtensionApiKeyModal/index.jsx:32-34` e `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey/BrowserExtensionApiKeyRow/index.jsx:49-52`, então o fix deve permitir a origem conhecida do servidor consultor.IA sem aceitar qualquer origem.

### [ALTO] Permissão global `<all_urls>`

- `browser-extension/public/manifest.json:19-20` e `browser-extension/public/manifest.json:36-37` concedem acesso amplo a todas as páginas.
- A captura de conteúdo só precisa acontecer na aba ativa após ação explícita; para 3 empresas piloto, `activeTab` + domínios específicos ou `optional_host_permissions` são suficientes.
- Com `<all_urls>`, qualquer bug futuro na extensão ou na cadeia de dependency/build vira leitura potencial de qualquer site.

### [ALTO] Credencial de API em `chrome.storage.sync` e chave em texto puro no servidor

- A key fica em `chrome.storage.sync` em `browser-extension/src/components/Config.jsx:45-46` e `browser-extension/public/background.js:292-297`, sem criptografia pela extensão.
- No servidor, `server/models/browserExtensionApiKey.js:20-27` persiste `key` em texto puro.
- Recomendação para piloto: `chrome.storage.local`, key de menor privilégio, revogação efetiva no disconnect e hash/criptografia da key no servidor em PR futuro.

### [ALTO] Captura de página inteira sem limite nem sanitização

- `document.body.innerText` em `browser-extension/public/contentScript.js:12` pode conter dados sensíveis da página inteira.
- O envio ocorre para o `apiBase` configurado em `browser-extension/public/background.js:333-343` e `browser-extension/public/background.js:348-365` sem tamanho máximo, preview ou confirmação adicional.
- Sem o fix do achado crítico, um `apiBase` malicioso transforma esse fluxo em exfiltração de conteúdo visível.

### [MÉDIO] Desconexão não revoga a API key em todos os caminhos

- O botão "Disconnect" quando o servidor está offline apenas limpa `chrome.storage.sync` em `browser-extension/src/components/Config.jsx:18-23`; a key continua válida no servidor.
- `BrowserExtension.disconnect` referencia `errorData` inexistente em `browser-extension/src/models/browserExtension.js:58`, fazendo o fluxo falhar no `catch` quando o servidor retorna `error`.
- Efeito prático: chaves órfãs e maior superfície de vazamento.

### [MÉDIO] Poll periódico de 1 minuto

- `chrome.alarms.create("updateWorkspaces", { periodInMinutes: 1 })` em `browser-extension/public/background.js:380` força uma chamada autenticada por minuto enquanto conectado.
- Não é um problema grave, mas é desnecessário para o piloto; usar `5-10` minutos ou atualizar workspaces apenas ao abrir o popup.

### [MÉDIO] Sem validação de esquema/origem do `apiBase`

- O popup aceita qualquer `apiBase` e apenas chama `/ping` e `/browser-extension/check` em `browser-extension/src/components/Config.jsx:25-49`.
- Para produção, exigir `https://` (com exceção de `localhost`) e opcionalmente permitir apenas a origem configurada no servidor.

### [MENOR] Permissões não utilizadas

- `notifications` não é usado; `activeTab` não é usado hoje.
- Remover `notifications` e adicionar `activeTab` somente quando o fluxo de captura sem `<all_urls>` estiver implementado.

### [MENOR] Branding e distribuição upstream

- Manifest, README, media, `package.json`, `index.html` e `LICENSE` ainda são AnythingLLM/Mintplex.
- O badge do Chrome Web Store aponta para a listagem da Mintplex em `browser-extension/README.md:30-32`.
- Qualquer distribuição para piloto precisa de rebrand completo e listagem própria.

## Checklist de aceitação para produção

- [ ] Rebrand de manifest, README, ícones, `media/`, `package.json`, `index.html` e `LICENSE`.
- [ ] Validar `event.origin`/`event.source` no content script antes de aceitar auto-connect.
- [ ] Remover `<all_urls>` de `host_permissions` e `content_scripts.matches`.
- [ ] Usar `activeTab` + `optional_host_permissions` ou domínios explícitos das empresas piloto.
- [ ] Remover permissão `notifications` e revisar `activeTab`.
- [ ] Exigir HTTPS para `apiBase`, exceto `localhost`.
- [ ] Trocar `chrome.storage.sync` por `chrome.storage.local` ou outra estratégia que não propague a key entre dispositivos.
- [ ] Limitar tamanho do `textContent` e mostrar preview/confirmação antes de salvar página inteira.
- [ ] Corrigir revogação da API key no disconnect e remover chaves órfãs.
- [ ] Reduzir poll de workspaces para intervalo maior ou atualização manual.
- [ ] Versionar `yarn.lock` e rodar auditoria de dependências antes de publicar.
- [ ] Testar manualmente com as 3 empresas piloto nos domínios reais.
- [ ] Confirmar que o privacy CI gate continua com 0 findings após qualquer mudança.

## Recomendação final para piloto

- Decisão: **REMOVER** do build do piloto.
- Esforço estimado: remover do build é baixo (~2h). HARDENING + rebrand completo fica na faixa de 15-25h.
- Próximos passos: manter `browser-extension/` isolado no monorepo, não publicar em loja, não incluir no pacote do piloto e registrar decisão no roadmap de hardening (`docs/architecture/27-revised-pr-roadmap.md:15`). Se um cliente piloto exigir o recurso, abrir PR específico com os itens do checklist de aceitação acima.
