# WandaTax Official

Production webhook backend for WhatsApp Cloud API + Supabase, deployed on Vercel.

## Stack

- Vercel Serverless Functions (Node.js)
- Meta WhatsApp Cloud API
- Supabase Postgres

## Core Features

- Webhook verification for Meta (`GET /api/webhook`)
- Stateful onboarding persisted in Supabase
- Language choice (English/French)
- NIU flow tracking
- Duplicate message protection
- Basic ledger parsing and storage (`income`, `expense`, MoMo-style SMS)
- Admin reporting endpoints with API-key auth

## Project Files

- `api/webhook.js`: verification + onboarding + message processing
- `api/parser.js`: amount/type parser
- `api/reports/daily.js`: daily transaction report endpoint
- `api/profiles.js`: profile lookup endpoint
- `lib/whatsapp.js`: WhatsApp sender
- `lib/admin.js`: admin key guard
- `lib/supabase.js`: Supabase client helper
- `supabase.sql`: required SQL schema
- `.env.example`: required environment variables
- `vercel.json`: route and CORS config

## Environment Variables

Set these in Vercel Project Settings:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PHONE_NUMBER_ID`
- `WHATSAPP_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `ADMIN_API_KEY`

## Supabase Setup

Run the full SQL in `supabase.sql`.

It creates/updates:

- `profiles`
- `whatsapp_events` (dedupe)
- `ledger_entries`

## Vercel Setup

1. Import repo into Vercel.
2. Add env vars.
3. Deploy.

## Meta Webhook Setup

- Callback URL: `https://<your-vercel-domain>/api/webhook`
- Verify Token: must exactly match `WHATSAPP_VERIFY_TOKEN`

## Conversation Flow

1. User sends `start` / `register` / `taxes`
2. Bot asks language (`1` English, `2` Francais)
3. Bot asks if user has NIU (yes/no)
4. If yes: bot requests NIU and stores it
5. If no: bot requests business name and stores it
6. After onboarding complete: bot records ledger entries from transaction messages

## Admin Endpoints

Send header `x-api-key: <ADMIN_API_KEY>`.

- `GET /api/reports/daily?date=YYYY-MM-DD`
- `GET /api/reports/daily?date=YYYY-MM-DD&phone=2376xxxxxxx`
- `GET /api/profiles/<phone>`
- `GET /api/profiles?phone=<phone>`

Example:

```bash
curl -H "x-api-key: YOUR_ADMIN_API_KEY" "https://<your-vercel-domain>/api/reports/daily?date=2026-04-07"
```

## Local Checks

```bash
npm install
npm run check
```

Optional local webhook run (requires Vercel CLI):

```bash
npm run dev
```

## Quick Production Test

1. Verify webhook URL in browser with challenge query.
2. Send `start` on WhatsApp.
3. Complete onboarding prompts.
4. Send `income 12000` and `expense 3500`.
5. Confirm rows in `profiles` and `ledger_entries`.
6. Call `/api/reports/daily` and `/api/profiles/<phone>` with `x-api-key`.