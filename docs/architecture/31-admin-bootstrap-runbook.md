# 31 - Admin Bootstrap Runbook

Este documento descreve como criar o primeiro admin de um deployment consultor.IA sem intervenção manual no banco.

## Como funciona

O bootstrap é feito pelo seed Prisma em `server/prisma/seed.js`, chamado em dois momentos:

1. `docker/docker-entrypoint.sh` executa `npx prisma db seed` depois do `prisma migrate deploy`.
2. `server/utils/boot/index.js` também executa o seed quando o servidor sobe sem o entrypoint Docker.

O seed lê `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Ele só cria o primeiro admin quando:

- as duas variáveis existirem;
- o e-mail for válido;
- a senha tiver pelo menos 12 caracteres;
- não existir nenhum user com role `admin` ou `manager` no banco.

O user criado recebe:

- `username`: o e-mail informado, em minúsculas;
- `password`: hash bcrypt (custo 10);
- `role`: `admin`;
- `suspended`: `0`.

O seed é idempotente: se já existir admin ou manager, ele não altera nada. Alterar `ADMIN_EMAIL` ou `ADMIN_PASSWORD` depois do primeiro boot não troca a senha do admin existente.

## Como usar no primeiro deploy de uma empresa

1. Defina as variáveis no `.env` do deployment **antes do primeiro boot**:

```bash
ADMIN_EMAIL=admin@empresa.com.br
ADMIN_PASSWORD='troque-por-uma-senha-longa-e-segura'
```

2. Suba o container. O entrypoint roda migration e seed automaticamente.
3. Confira no log a linha `created initial admin user: admin@empresa.com.br`.
4. Faça login com o e-mail e a senha usados no bootstrap.

Em execução fora de Docker, use:

```bash
cd server
ADMIN_EMAIL=admin@empresa.com.br \
ADMIN_PASSWORD='troque-por-uma-senha-longa-e-segura' \
node prisma/seed.js
```

## Como rotacionar senha de admin depois

O bootstrap não atualiza users existentes. Para trocar a senha:

1. Faça login como o próprio admin.
2. Use o fluxo de alteração de senha na interface de usuário/account.
3. Se não houver acesso à interface, use o endpoint/processo existente de password recovery ou atualize o hash via uma operação administrativa controlada; nunca grave senha em texto puro.

## Troubleshooting

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Log `skipping admin bootstrap` | `ADMIN_EMAIL` ou `ADMIN_PASSWORD` ausentes | Defina as duas variáveis no primeiro boot. |
| Log `ADMIN_EMAIL must be a valid email address` | Valor inválido | Corrija o e-mail. |
| Log `password must be at least 12 characters` | Senha muito curta | Use pelo menos 12 caracteres. |
| Log `admin already exists, skipping` | Já existe admin/manager | Não é erro; o seed é idempotente. |
| `prisma db seed` falhou | Banco indisponível, migration pendente ou input inválido | Veja o log do seed; o container continua subindo e o bootstrap pode ser repetido manualmente. |
| Login do admin falha | Senha trocada depois do bootstrap | Use o fluxo de password recovery/account; o seed não sobrescreve users. |

## Limitações

- Não cria múltiplos admins em um único bootstrap.
- Não atualiza a senha de um admin existente.
- Não força troca de senha no primeiro login.
- O model `users` não possui campo `validated`; a criação direta no seed usa apenas os campos existentes no schema.
