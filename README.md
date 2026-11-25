# 😈 INIMIGOS SECRETO INFINITOS

App de **Inimigo Secreto** com painel administrativo, cadastro por telefone com DDD `(xx) x xxxx xxxx`, senha pessoal por participante e sorteio sigiloso garantido (ninguém tira a si mesmo, ninguém tira a mesma pessoa e nem o admin vê os pares).

## Rodar localmente

Requer Node.js 22+ (usa SQLite nativo localmente em `data/inimigo-secreto.db`):

```bash
node server.js
```

- **Site principal:** http://127.0.0.1:3000
- **Painel Admin:** http://127.0.0.1:3000/admin
  - **Login:** `infinitos`
  - **Senha:** `senhadificil123`

Testes automatizados:

```bash
node test/verify.js
```

## Deploy na Vercel (com banco PostgreSQL grátis)

A Vercel usa funções serverless (sem disco persistente local), então em produção o app conecta automaticamente em um banco **PostgreSQL** via variável `DATABASE_URL` ou `POSTGRES_URL` (e cria todas as tabelas sozinho na primeira requisição).

1. Suba este repositório para o **GitHub**.
2. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório `inimigos-secreto-infinitos`.
3. Clique em **Deploy**.
4. No painel do projeto na Vercel, vá na aba **Storage** -> **Create Database** -> escolha **Neon (Serverless Postgres)** (plano gratuito) e conecte ao projeto.
   - A Vercel vai injetar automaticamente a variável `DATABASE_URL` / `POSTGRES_URL`.
5. Faça um **Redeploy** na aba **Deployments** e pronto!

### Variáveis de ambiente opcionais

- `DATABASE_URL` ou `POSTGRES_URL`: URL do PostgreSQL (obrigatória na Vercel; opcional localmente).
- `ADMIN_USER`: login do painel admin (padrão: `infinitos`).
- `ADMIN_PASS`: senha do painel admin (padrão: `senhadificil123`).
