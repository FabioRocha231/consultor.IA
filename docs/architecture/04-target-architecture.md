# 04 - Target Architecture

## Princípio

AnythingLLM continua sendo o **AI Core**. consultor.IA adiciona product layer (Organization, onboarding, RAG config, integrações, analytics, observabilidade) sem reescrever o core.

```mermaid
flowchart TB
  subgraph Consultor["consultor.IA Product Layer"]
    FE["Frontend consultor.IA"]
    ORG["Organization / Company Config"]
    ONB["Onboarding Business"]
    RAGC["RAG Config Layer"]
    INT["Integration Layer (n8n tools)"]
    DASH["Company Analytics"]
    OBS["OTel Instrumentation"]
  end

  subgraph Core["AI Core (AnythingLLM fork)"]
    SERVER["Server (Express/WS)"]
    CHAT["Chat Engine / Streaming"]
    RAG["RAG Engine"]
    AGENT["Agent Runtime (Aibitat)"]
    DOCS["Document Engine"]
    API["HTTP API + Developer API"]
  end

  subgraph Data["Data Plane"]
    QD["Qdrant"]
    DB[("PostgreSQL / SQLite storage")]
    FILES["Document storage"]
  end

  subgraph Ext["Integration Plane"]
    N8N["n8n"]
    EXT["Company systems (CRM, agenda, ERP)"]
    LLM["LLM Provider"]
    EMB["Embeddings Provider"]
  end

  subgraph Obs["Internal Observability Plane"]
    ALLOY["Grafana Alloy / OTel Collector"]
    PROM["Prometheus"]
    LOKI["Loki"]
    TEMPO["Tempo"]
    GRAFANA["Grafana"]
  end

  FE --> SERVER
  FE --> ORG
  ORG --> ONB
  ORG --> RAGC
  RAGC --> SERVER
  INT --> AGENT
  INT --> N8N
  N8N --> EXT
  SERVER --> CHAT
  CHAT --> RAG
  CHAT --> AGENT
  RAG --> QD
  AGENT --> QD
  DOCS --> FILES
  DOCS --> QD
  SERVER --> API
  SERVER --> LLM
  SERVER --> EMB
  SERVER --> DB
  SERVER --> OBS
  FE --> OBS
  OBS --> ALLOY
  ALLOY --> PROM
  ALLOY --> LOKI
  ALLOY --> TEMPO
  GRAFANA --> PROM
  GRAFANA --> LOKI
  GRAFANA --> TEMPO
```

## Decisões estruturais

1. **Um deployment por empresa no MVP** (`ADR-003`): A/B/C independentes; máxima simplicidade de rollback/isolação.
2. **Qdrant por empresa** (`ADR-004`): cada deployment tem seu Qdrant; collection por workspace.
3. **n8n é integration layer** (`ADR-005`): não é engine de RAG; consultor.IA chama webhooks n8n via tools allowlisted/assinados.
4. **Observabilidade compartilhada** com labels de segmentação `organization_id`, `deployment_id`, `environment`, `service`.
5. **App fala OTLP** (`ADR-001`): não conhece Loki/Tempo/Prometheus; Alloy faz roteamento.
6. **Sem multi-tenancy sofisticado**: dados por empresa separados fisicamente; contrato de dados prepara evolução.

## Componentes alvo

| Component | Papel |
| --- | --- |
| consultor.IA Product Layer | UX, empresa, config, integrações, analytics, segurança |
| AI Core (AnythingLLM) | chat, RAG, agentes, documentos, providers, API |
| Qdrant | vector storage por empresa |
| n8n | integrações de negócio |
| OTel SDK | traces, metrics, structured logs |
| Alloy | recebe OTLP, roteia |
| Prometheus/Loki/Tempo/Grafana | storage e visualização internos |
