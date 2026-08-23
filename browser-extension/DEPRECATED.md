# browser-extension: fora do build dos pilotos

## Status

**DEPRECATED para o build de piloto do consultor.IA.** O código permanece versionado neste diretório para referência e futura reativação, mas não deve ser incluído no pacote Docker dos 3 pilotos.

## Por que está fora do build

A auditoria de `browser-extension/` identificou achados de segurança incompatíveis com o piloto:

- `window.postMessage` aceita `NEW_BROWSER_EXTENSION_CONNECTION` de qualquer origem e pode trocar `apiBase`/`apiKey` da extensão.
- O manifest usa `<all_urls>` em `host_permissions` e `content_scripts.matches`.
- A API key fica em `chrome.storage.sync` e o polling autenticado roda a cada 1 minuto.
- O componente ainda carrega branding e distribuição upstream da Mintplex/AnythingLLM.

Para 3 empresas piloto, o valor do recurso é baixo frente ao custo de hardening e ao risco de exfiltração de conteúdo de páginas.

## Onde está o código

- Diretório: `browser-extension/`
- Manifest: `browser-extension/public/manifest.json`
- Background/content script: `browser-extension/public/background.js`, `browser-extension/public/contentScript.js`
- Popup: `browser-extension/src/`
- Build: `browser-extension/package.json`

## Quem deve reativar

A reativação exige um PR futuro com hardening completo, incluindo:

1. Rebrand completo (manifest, README, ícones, media, package, index.html e LICENSE).
2. Validação de `event.origin`/`event.source` no auto-connect.
3. Remoção de `<all_urls>`; uso de `activeTab` + domínios explícitos ou `optional_host_permissions`.
4. `chrome.storage.local` em vez de `chrome.storage.sync`.
5. Exigência de `https://` para `apiBase`, exceto `localhost`.
6. Correção da revogação da API key no disconnect.
7. Limite de tamanho para `textContent` e revisão do polling.

## Estimativa

Reabilitação completa: **15-25h**.

Decisão registrada em `docs/architecture/30-vendored-components-decision.md`.
