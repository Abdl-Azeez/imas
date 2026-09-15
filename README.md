# IMAS CS Tutor

Runnable Express + TypeScript POC for the guided-response tutor in `IMAS-CS-Tutor-PRD.md`.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. For local testing, set `AI_PROVIDER=ollama` in `.env`. Ollama runs locally and does not need an API key. To use OpenAI later, set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY`.
5. Run `npm run dev`.
6. Open http://localhost:3000.

The development database is created at `data/imas.sqlite`. A demo account is created automatically on first startup: username `demo`, password `demo1234`.

## Production notes

This POC uses SQLite so it runs without external services. For Render, set `DATABASE_PATH` to a persistent mount or replace the repository with Postgres using `schema.sql`; the API boundary and data model are already separated in `src/store.ts`. Set `OPENAI_API_KEY`, `JWT_SECRET`, and `NODE_ENV=production` as Render environment variables, never in source control.

The server enforces the daily cap before calling the model, rate-limits chat requests, validates the structured response, and stores conversation state server-side. The browser only receives the response contract from the PRD.

## Ollama setup

Install Ollama from https://ollama.com/download/windows, then run `ollama pull llama3.2:3b`. Keep Ollama running while using the tutor. The backend connects to its local OpenAI-compatible endpoint at `http://127.0.0.1:11434/v1`.
"# imas" 
