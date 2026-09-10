# PR 49 - Worker WhatsApp long-lived polling loop (PR-NEW-4)

## Contexto

Antes do PR, o Bree re-spawnava o worker WhatsApp a cada 5s com timeout de 2m,
gerando ~17.280 spawns por dia e desperdiçando processo/arranque por mensagem
opcionalmente rara. O worker agora vive no processo Bree e faz polling interno.

## Antes vs Depois

| Momento | Comportamento |
| --- | --- |
| Antes | Bree schedule `{ interval: "5s", timeout: "2m" }`; processo novo a cada ciclo |
| Depois | Bree `{ timeout: 0, start: true }`; worker iniciado no boot |
| Loop | Poll default 5s (`WHATSAPP_WORKER_POLL_MS`), watchdog 2m por iteração |
| Falha | Backoff 30s após erros consecutivos; aborta com exit(1) após 10 erros seguidos |
| Graceful stop | `SIGTERM`/`SIGINT` abortam o loop e encerram o processo |
| Startup | `WHATSAPP_WORKER_SKIP_STARTUP=1` permite pular o run inicial |

## Diff resumido

- `server/jobs/process-whatsapp-messages.js`: `runPollLoop`, `sleep`, signal
  handling, watchdog, backoff e configs de env.
- `server/utils/BackgroundWorkers/index.js`: remoção do intervalo de 5s e uso
  de `start: true` para o job do WhatsApp.
- Teste novo de abort signal no poll loop.
- Total: 3 arquivos, +108/-13.

## Quality gates

`90/824`; 9 checks verdes.

## Rollback

`git revert 1397265a`. O rollback volta ao Bree respawn de 5s; o loop interno e
os handlers de sinal desaparecem.

## Notas

- `{ timeout: 0, start: true }` não é shape canônico documentado do Bree para
  job recorrente, mas funciona com a versão instalada para iniciar o worker uma
  vez e deixar o próprio job segurando o processo.
- O polling não só processa fila: também faz recovery de stale processing e
  limpeza de mensagens antigas.

## Referências

- [ADR-015 Menu and Orders Domain](../adr/015-menu-and-orders-domain.md)
- PR #49
