# 30 - Decisão: browser-extension fora do build do piloto e hardening do embed

## Decisão

1. **`browser-extension/`: REMOVER do build dos 3 pilotos.** O diretório continua versionado e isolado no monorepo, mas não entra no pacote do piloto nem em builds Docker. A reativação só pode ocorrer em PR futuro com hardening completo.
2. **`embed/`: HARDENING + REBRAND.** O widget continua suportado no piloto, com marca consultor.IA por padrão, DOMPurify no caminho de streaming e allowlist para URLs configuráveis via atributos.

## Contexto

As auditorias de vendored components identificaram que:

- `browser-extension/` mantém o manifest upstream, `<all_urls>`, credencial em `chrome.storage.sync`, polling de 1 minuto e um auto-connect via `window.postMessage` que aceita `NEW_BROWSER_EXTENSION_CONNECTION` de qualquer origem. Esse achado é crítico porque qualquer página visitada pode trocar o `apiBase`/`apiKey` e, depois, receber conteúdo da extensão.
- `embed/` não contém telemetria, mas publica marca AnythingLLM em strings padrão e em artefatos, renderiza streaming sem DOMPurify e permite egress por clique/imagem para hosts arbitrários via `data-brand-image-url`, `data-assistant-icon` e `data-sponsor-link`.

Referências de auditoria: `docs/architecture/22-embed-audit.md` e `docs/architecture/23-browser-extension-audit.md`.

## Decisão detalhada: browser-extension

- Não deletar código.
- Não mover o diretório.
- Adicionar `browser-extension/` ao `.dockerignore` para excluí-lo do build do piloto.
- Documentar `SKIP_BROWSER_EXTENSION=true` no `docker/.env.example`.
- Criar `browser-extension/DEPRECATED.md` com justificativa, path, requisitos de reativação e estimativa de esforço.

## Decisão detalhada: embed

- Rebrand dos defaults visíveis: sponsor, assistant name, alt do ícone, título da página de teste, README e package name.
- Aplicar `DOMPurify.sanitize()` no render final do caminho de streaming, alinhando com o histórico.
- Criar `embed/src/utils/urlAllowlist.js` e aplicar a checagem em `brandImageUrl`, `assistantIcon` e `sponsorLink`.
- Allowlist default vazia: URLs permitidas são apenas same-origin ou domínios declarados em `data-allow-external-domains`.
- Manter compatibilidade do API público do widget: os nomes de arquivo, atributos existentes e eventos internos não são alterados.

## Critérios de aceitação

- `rg -i "anythingllm" embed/src/ embed/index.html embed/README.md embed/package.json` não retorna strings visíveis em runtime, exceto comentários contextuais ou identificadores internos preservados por compatibilidade.
- `browser-extension/` não é incluído no build do piloto.
- Bundle publicado em `frontend/public/embed/*` é rebuildado e contém as strings consultor.IA.
- `DOMPurify.sanitize()` está aplicado no streaming.
- `isAllowedEmbedUrl()` está aplicado nos três atributos configuráveis.
- CI/local validation do PR passa lint e build do embed.

## Reativação futura do browser-extension

Se um cliente piloto exigir a extensão:

1. Abrir PR separado com rebrand completo (manifest, README, ícones, media, package, index.html e LICENSE).
2. Validar `event.origin`/`event.source` antes de aceitar auto-connect.
3. Remover `<all_urls>` de `host_permissions` e `content_scripts.matches`; usar `activeTab` + domínios explícitos ou `optional_host_permissions`.
4. Trocar `chrome.storage.sync` por `chrome.storage.local`.
5. Exigir `https://` para `apiBase`, exceto `localhost`.
6. Corrigir revogação da API key no disconnect.
7. Limitar tamanho de `textContent` e revisar polling.

Esforço estimado para reabilitação completa: **15-25h**.

## Restrições

- `embed/src/utils/constants.js` não muda: o origin do `stylesSrc` continua derivado do script src.
- `embed/src/models/chatService.js` não muda: as chamadas continuam apenas para `baseApiUrl`.
- Não introduzir dependência nova para o allowlist; usar a API `URL` do browser.
