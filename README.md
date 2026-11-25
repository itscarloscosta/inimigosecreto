# 😈 INIMIGOS SECRETO INFINITOS

App de **Inimigo Secreto** construído com **Next.js (App Router) + PostgreSQL**, pronto para rodar com **1 comando no Docker Desktop** e fazer **deploy zero-config na Vercel** via GitHub.

## Rodar no Docker Desktop

Com o Docker Desktop aberto, execute na pasta do projeto:

```bash
docker compose up --build
```

Isso sobe automaticamente:
- **PostgreSQL 16** (`db`, porta `5432`, volume persistente `pgdata`)
- **App Next.js** (`web`, porta `3000`)

Acesse no navegador:
- **Site principal:** http://localhost:3000
- **Painel Admin:** http://localhost:3000/admin
  - **Login:** `infinitos`
  - **Senha:** `senhadificil123`

Para parar os containers:

```bash
docker compose down
```

## Deploy na Vercel (via GitHub)

A Vercel detecta **Next.js** automaticamente — não precisa configurar Build Command nem `vercel.json`:

1. Importe o repositório na Vercel (em **Settings -> Build and Deployment -> Framework Preset**, selecione **Next.js** se já existia o projeto antigo como "Other").
2. No projeto na Vercel, vá em **Storage -> Create Database -> Neon (Serverless Postgres)** (gratuito) e conecte ao projeto (`DATABASE_URL` / `POSTGRES_URL` é preenchida automaticamente).
3. Faça **Redeploy** na aba **Deployments**.
4. Valide `https://SEU-DOMINIO.vercel.app/api/health` (deve retornar `{"ok": true}`).
