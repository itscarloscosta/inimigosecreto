# 😈 INIMIGOS SECRETO INFINITOS

App 100% nativo para **Vercel** (Static Edge CDN + Vercel Serverless Functions + **Neon Serverless Postgres**).

## Tecnologias Vercel utilizadas

- **Frontend estático (`public/`):** servido direto pela Edge CDN da Vercel (`outputDirectory: "public"`).
- **Backend (`api/`):** 6 Vercel Serverless Functions nativas (`health`, `public-info`, `participant`, `admin-auth`, `admin-data`, `admin-draw`).
- **Banco de dados (`lib/neon.js`):** `@neondatabase/serverless` (driver HTTP oficial da integração Neon Postgres no Vercel Storage), com criação automática das tabelas e transações atômicas (`sql.transaction`).

## Como subir na Vercel

1. Importe este repositório em [vercel.com/new](https://vercel.com/new) (Framework Preset: **Other**, sem alterar build command).
2. No projeto na Vercel, vá em **Storage** -> **Create Database** -> **Neon (Serverless Postgres)** (gratuito) -> **Connect to Project**.
3. Faça um **Redeploy** na aba **Deployments**.
4. Teste `https://SEU-DOMINIO.vercel.app/api/health` (deve retornar `{"ok": true}`).

## Acesso

- **Site principal:** `/` (telefone com DDD `(xx) x xxxx xxxx` + criação de senha pessoal)
- **Painel Admin:** `/admin`
  - **Login:** `infinitos`
  - **Senha:** `senhadificil123`
