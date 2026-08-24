# 28 - First PR Plan: `privacy/runtime-egress-audit` (PR 14)

Plano detalhado para o primeiro PR pós-MVP. Este é o PR que destrava toda a fase de hardening: ele transforma o privacy gate atual (que só faz import smoke) em uma auditoria real de runtime.

Baseado em `26-production-readiness-gap-analysis.md` (gap #01 e #02) e `27-revised-pr-roadmap.md` (PR 14).

## Objective

Construir um privacy gate que **exercita o runtime real** do consultor.IA, captura todo outbound durante workflows críticos, falha o CI se qualquer host não está na allowlist, e permite defender objetivamente o claim "zero external telemetry".

## Current state (gap)

- `.github/workflows/privacy-gate.yaml` tem 3 jobs: `static-privacy-check`, `network-privacy-check`, `dependency-audit`.
- `server/scripts/privacy-scan.mjs --network` faz `import()` de módulos de `server/endpoints/`, intercepta `fetch`, e compara hosts contra `server/scripts/privacy-allowlist.json`. **Não executa handlers**, **não exercita jobs**, **não roda providers**, **não inicia collector**.
- `privacy-allowlist.json` é global e ampla — lista todos os LLM providers suportados pelo código, mesmo que um deployment específico só use 1.
- Sem deploy-time egress policy: o que controla o que sai é a allowlist do scan, não o deployment real.

## Gap a fechar

Hoje: "privacy-scan --network PASS" não garante "zero unexpected runtime egress".

Depois do PR: o CI exercita boot, auth, onboarding, workspace create, PDF upload, parsing, embedding, Qdrant indexing, RAG query, LLM chat, streaming chat, agent execution, n8n tool execution, feedback, RAG eval, e shutdown. Cada um desses fluxos tem seu outbound capturado e validado contra uma allowlist.

## Scope

### IN

1. **Runtime egress harness** (`server/scripts/privacy-egress-harness.mjs`): sobe o stack em modo isolated (Postgres + Qdrant + LLM stub local), executa workflows críticos em sequência, captura todo fetch/XHR via proxy HTTP local, e produz um relatório JSON.
2. **Allowlist atualizada** com base no `24-runtime-egress-map.md` (achados do egress map). Diferenciar `domains` (código suporta) de `deployment_egress_policy` (este deployment específico).
3. **CI job novo** `runtime-egress-audit` em `.github/workflows/privacy-gate.yaml`:
   - Postgres em service container
   - Qdrant em service container
   - LLM stub local (mock HTTP server que responde a `/v1/chat/completions` etc.)
   - Sobe server com `OTEL_SDK_DISABLED=true` para não interferir
   - Roda o harness
   - Compara relatório contra `privacy-runtime-allowlist.json`
   - Falha se algum host não está na allowlist
4. **Deploy-time egress policy** (gap P0 #02): variável `DEPLOYMENT_EGRESS_DOMAINS` (comma-separated) que complementa o scan estático. Em deployments produtivos, recomenda-se deny-by-default via firewall/proxy reverso (documentar, não implementar aqui).
5. **ADR-011** (`docs/adr/011-runtime-egress-policy.md`): documenta a política.

### OUT

- Não implementa deny-by-default na borda (responsabilidade do deploy, não do código).
- Não muda o privacy-scan existente (continua funcionando como line of defense #1).
- Não faz hardening do `embed/` ou `browser-extension/` (são PRs 15).
- Não cria UI para gestão de allowlist.

## Files / modules affected

| Arquivo | Mudança |
| --- | --- |
| `server/scripts/privacy-egress-harness.mjs` | Novo. Orquestra workflows. |
| `server/scripts/privacy-runtime-allowlist.json` | Novo. Allowlist do runtime. |
| `server/scripts/privacy-llm-stub.mjs` | Novo. Stub HTTP para LLM. |
| `server/scripts/privacy-egress-proxy.mjs` | Novo. Proxy interceptador. |
| `server/scripts/privacy-scan.mjs` | Adicionar `--runtime` que chama o harness. |
| `server/scripts/privacy-allowlist.json` | Atualizar com base no egress map. |
| `.github/workflows/privacy-gate.yaml` | Adicionar job `runtime-egress-audit`. |
| `docker/docker-compose.test.yml` | Novo (ou reutilizar). Stack de teste leve. |
| `docs/adr/011-runtime-egress-policy.md` | Novo. |
| `docs/architecture/29-runtime-egress-policy-runbook.md` | Novo. Runbook para operators. |
| `server/.env.example`, `docker/.env.example` | Documentar `DEPLOYMENT_EGRESS_DOMAINS`. |
| `server/__tests__/privacy/egress-harness.test.js` | Novo. Smoke do harness. |

## Architecture impact

- **Política de egress em camadas**:
  - Layer 1: `privacy-scan` estático (já existe) — pega domínios/SDKs no código.
  - Layer 2: `privacy-scan --network` (já existe) — pega import-time fetch.
  - Layer 3: `privacy-egress-harness` (novo) — pega runtime real.
  - Layer 4: deploy-time policy (env var) — restringe egress deste deployment.
  - Layer 5 (fora do código): firewall/proxy reverso — deny-by-default na borda.
- Nenhuma mudança em runtime funcional. Tudo é tooling/CI.

## Security impact

- **Positivo**: garante que o produto realmente não vaza dados em runtime, não só em código estático.
- **Positivo**: detecta regressões vindas do upstream sync.
- **Neutro**: o harness precisa de um LLM stub local; não exercita provedores reais (privacy by design — não queremos que CI ligue para API paga).
- **Risco**: harness pode ter falsos positivos se algum teste legítimo precisar de host externo. Mitigação: `--exclude` opt-in, allowlist explícita.

## Privacy impact

- **Positivo**: este PR é o que faz o claim "zero external telemetry" ser defensável.
- **Positivo**: protege contra reintrodução de telemetria upstream em syncs futuros.
- **Positivo**: o harness roda 100% em CI local, não toca rede externa — ele PRÓPRIO respeita a política.

## Observability impact

- O CI produz um relatório JSON que pode ser arquivado como artifact.
- Métrica opcional: tempo de execução do harness (deve ficar < 5 min para CI não ficar lento).
- Nenhum impacto no runtime observability (OTel do produto).

## Tests

### Unit

- `privacy-egress-harness.test.js`: valida que o harness detecta outbound não permitido (testar com 1 host conhecido vs 1 host proibido).

### Integration (CI)

- O próprio CI é o teste de integração.

### Smoke local

```bash
cd server
node scripts/privacy-scan.mjs --runtime --json
```

Deve:

1. Subir Postgres + Qdrant efêmeros.
2. Iniciar server com env de teste.
3. Executar cada workflow da lista.
4. Capturar todas as conexões outbound via proxy.
5. Comparar com `privacy-runtime-allowlist.json`.
6. Sair 0 se tudo ok, 1 com relatório se algum host não permitido.

## Acceptance criteria

1. **`node scripts/privacy-scan.mjs --runtime` roda em < 5 minutos** em CI runner padrão (ubuntu-latest, 2 core).
2. **Todos os workflows** abaixo são exercitados em sequência e cada um produz evidência de execução:
   - boot (server sobe sem erro)
   - auth (signup + login)
   - onboarding (Organization criada)
   - workspace creation
   - PDF upload + parsing
   - embedding + Qdrant indexing
   - RAG query
   - LLM chat (não-streaming)
   - LLM chat (streaming via SSE)
   - agent execution
   - n8n tool execution (mock n8n endpoint)
   - feedback positivo
   - RAG evaluation (mock mode)
   - shutdown
3. **Outbound capturado** inclui: Postgres, Qdrant, LLM stub, mock n8n. Nenhum outro host aparece.
4. **Forçar um host proibido** no LLM stub (ex: `posthog.com`) e rodar o harness → CI falha com mensagem clara apontando o host.
5. **`DEPLOYMENT_EGRESS_DOMAINS`** documentado em `.env.example`. Comentário explica deny-by-default na borda.
6. **ADR-011** criado e linkado do `docs/architecture/README.md`.
7. **Runbook** em `docs/architecture/29-runtime-egress-policy-runbook.md` explica: como adicionar host legítimo, como rodar o harness local, como interpretar relatórios.
8. **CI**: 3 jobs verdes (static, network, runtime) — `dependency-audit` continua `continue-on-error`.
9. **Sem regressão**: privacy-scan existente continua passando, sem mudanças de comportamento em runtime.

## Upstream conflict risk

- **Baixo**: tudo é código novo + ajustes em CI/allowlist. Não toca chat/RAG/agents.
- Único ponto de atenção: `privacy-allowlist.json` é editado para incluir achados do egress map. Conflito trivial, resolver manualmente.

## Rollback strategy

- Reverter o PR restaura o estado anterior (privacy gate com 2 jobs).
- Nenhuma migração de dados.
- Nenhuma mudança em runtime.
- Allowlist volta ao estado anterior (pode ter sido expandida — voltar via `git revert` resolve).

## Implementation order (sugerido para o worker)

1. **Fase 1 — Egress map**: já está feito em `24-runtime-egress-map.md`. Usar como entrada.
2. **Fase 2 — Allowlist estática**: atualizar `privacy-allowlist.json` com base no egress map.
3. **Fase 3 — Harness skeleton**: criar `privacy-egress-harness.mjs` mínimo que sobe Postgres + Qdrant efêmeros e inicia server.
4. **Fase 4 — Workflows**: implementar cada workflow (boot, auth, onboarding, etc.) com chamadas HTTP diretas para o server.
5. **Fase 5 — Proxy interceptador**: criar `privacy-egress-proxy.mjs` que escuta em porta aleatória, encaminha para o destino real, registra tudo.
6. **Fase 6 — Validação**: comparar hosts capturados contra `privacy-runtime-allowlist.json`.
7. **Fase 7 — LLM stub**: criar `privacy-llm-stub.mjs` que responde a `/v1/chat/completions`, `/v1/embeddings` etc.
8. **Fase 8 — CI**: adicionar job ao `privacy-gate.yaml`.
9. **Fase 9 — ADR e runbook**: escrever `011-runtime-egress-policy.md` e `29-runtime-egress-policy-runbook.md`.
10. **Fase 10 — Negative test**: adicionar teste que força `posthog.com` no stub e verifica que o harness falha.

## Pontos abertos para confirmar antes de implementar

1. **Onde o harness vai rodar Postgres + Qdrant efêmeros?** Opções:
   a. Service containers no GitHub Actions (GitHub-hosted). Roda rápido, custo zero, mas tem limite de tempo.
   b. Containers locais dentro do runner via Docker-in-Docker. Mais flexível.
   c. Binários nativos (postgresql + qdrant standalone). Mais leve.
   
   Recomendação inicial: (a) para CI, (c) para smoke local. Decidir no início da Fase 3.

2. **Como simular o LLM?** Stub HTTP local que responde JSON, ou mock em código que bypassa o provider?
   - Stub HTTP é mais fiel ao runtime real. Recomendado.

3. **Como simular n8n?** Mesma decisão: stub local ou mock em código?
   - Stub local. Mais simples e detecta se algo tenta chamar `n8n.external.example.com` hardcoded.

4. **Allowlist inicial**: começar com o que já existe + o que o egress map confirmar. Hosts não confirmados ficam como `[A INVESTIGAR]` até o harness rodar e validar.

5. **Quem opera o deny-by-default na borda?** Não é código, é deploy. Documentar no runbook e no `28-runtime-egress-policy-runbook.md`. Recomendar Caddy/Traefik/nginx com allowlist, mas não codar.

## Definition of Done

- [ ] `node scripts/privacy-scan.mjs --runtime` passa localmente
- [ ] CI job `runtime-egress-audit` verde
- [ ] Negative test (`posthog.com` no stub) falha como esperado
- [ ] ADR-011 mergeado
- [ ] Runbook mergeado
- [ ] Allowlist atualizada e justificada
- [ ] Sem regressão no privacy-scan estático ou de network
- [ ] PR aprovado e mergeado
