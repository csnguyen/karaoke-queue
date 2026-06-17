# Deployment Guide

## Prerequisites

- [Vercel CLI](https://vercel.com/docs/cli) or a Vercel account connected to your Git provider
- A [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key

## Environment Variables

### YouTube API key
Set in the Vercel dashboard under **Project → Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `VITE_YOUTUBE_API_KEY` | YouTube Data API v3 key |

> **Never commit this key.** The `VITE_` prefix exposes it to the browser bundle — restrict it in Google Cloud Console to your Vercel domain (e.g. `https://your-app.vercel.app`).

### Upstash Redis (real-time room sync)
Use the **Vercel-Upstash integration** — it auto-injects the credentials so you never touch them manually:

1. In the Vercel dashboard go to **Storage → Connect Store → Upstash**.
2. Create a new Redis database (or connect an existing one).
3. Click **Connect to Project** — Vercel automatically adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to your project's environment variables.

For **local dev**, copy those two values from the Upstash console into `.env.local`:
```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```
Then run `vercel dev` (not `npm run dev`) so the `api/` serverless functions are served locally.

## Deploy

### Via Vercel CLI

```bash
npm run build       # verify build is green locally first
vercel              # follow prompts for first-time setup
vercel --prod       # promote to production
```

### Via Git integration

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import the repo in the Vercel dashboard.
3. Add `VITE_YOUTUBE_API_KEY` in the Environment Variables step.
4. Click **Deploy**. Vercel auto-detects Vite and runs `npm run build`.

## SPA Routing

`vercel.json` includes a catch-all rewrite so React Router routes (`/` and `/tv`) work on direct load and hard refresh:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## Usage

| URL | Device |
|---|---|
| `https://your-app.vercel.app/tv` | Living room TV — full-screen player + queue marquee |
| `https://your-app.vercel.app/` | Phone — search, add songs, manage queue |

Open both simultaneously. Changes on the phone sync to the TV instantly via `localStorage` storage events (works when both are on the same browser session or same device; for true cross-device sync a backend is needed).

## Local Development

```bash
cp .env.example .env.local        # if provided, or create manually
echo "VITE_YOUTUBE_API_KEY=your_key_here" > .env.local
npm run dev
```

Then open `http://localhost:5173/tv` (TV view) and `http://localhost:5173/` (mobile view) in separate tabs.

## Running Tests

```bash
npm test
```

All 60 tests must pass before deploying.
