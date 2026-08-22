# 19 - Main Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Upstream reintroduz telemetria | Média | Alto | PR 01 + PR 13 gate; revisar cada sync |
| Cross-company data leakage | Baixa (deploy separado) | Crítico | deployment físico, Qdrant/DB/storage por empresa, org_id |
| Prompt injection / tool abuse | Alta | Alto | allowlist tools, approval, sem HTTP arbitrário, n8n contract |
| RAG quality baixa | Média | Alto | eval suite, fallback, metrics, source metadata |
| Secret leakage em logs/traces | Média | Alto | redação, Sensitive Debug Mode, CI check |
| Model pricing remoto vira outbound não autorizado | Média | Médio | allowlist ou remoção/self-host |
| CDN/HuggingFace download de modelos | Média | Médio | pré-baixar na imagem; allowlist |
| Community Hub/dados externos | Média (até PR 01) | Médio | remover no PR 01 |
| Migration de Organization quebra core | Baixa | Alto | nullable, rollback testado, feature flag |
| n8n indisponível | Média | Médio | timeout, retry, fallback humano, alerta |
| Alta cardinalidade em labels | Média | Médio | definir labels estáveis |
| Submodulos embed/browser-extension não auditados | Alta | Médio | auditar antes de release |
| Falta de backups | Alta hoje | Crítico | runbook e backups por empresa |
| Conflito de merge com upstream | Alta | Médio | PRs pequenos, wrapper, ADR-010 |
| Falta de testes/CI para privacy | Alta | Alto | PR 13 antes de produção |
| Escopo explode para features não pedidas | Média | Médio | MVP definition of done, ponytail, só implementar confirmado |

## Riscos que precisam validação humana

1. `HYPOTHESIS:` Community Hub pode ser removido sem impacto para clientes (não usado no piloto).
2. `HYPOTHESIS:` model pricing (`models.dev`) pode ser removido sem impacto operacional para MVP.
3. `HYPOTHESIS:` fallback nativo `query mode` é suficiente para o cenário de não-encontrou; human handoff precisa de definição de produto.
4. `HYPOTHESIS:` 1 deployment por empresa é aceitável em custo/operação; alternativa shared-Qdrant com collections foi descartada.
5. `HYPOTHESIS:` agents e tools devem ser desabilitados por default no MVP, deixando n8n como caminho de integração.
