# UniMate Backend — Deployment Guide (Fly.io + Upstash, Free Tier)

## What gets deployed

| Service | Platform | Cost |
|---------|----------|------|
| FastAPI API | Fly.io `web` process | Free (auto-stops when idle) |
| Celery worker + Beat | Fly.io `worker` process | Free (always on) |
| Redis broker | Upstash | Free (10k commands/day) |
| Database | Turso | Already live |

Free allowances used: 2 of 3 Fly.io shared VMs. You stay within the free tier as long as the worker VM runs ≤ ~2,000 hours/month (it runs 24/7 = 720 hours — well within limits).

---

## Prerequisites

- A [Fly.io](https://fly.io) account (requires credit card for verification, but **will not charge** within free limits)
- An [Upstash](https://console.upstash.com) account (no card required)
- `flyctl` CLI installed

---

## Step 1 — Install flyctl

```bash
# macOS
brew install flyctl

# or via install script
curl -L https://fly.io/install.sh | sh
```

Log in:
```bash
fly auth login
```

---

## Step 2 — Create Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com) → **Create Database**
2. Name: `unimate-redis`
3. Region: **ap-southeast-1** (Singapore — closest to Pakistan)
4. Type: **Regional** (not Global — saves cost)
5. Click **Create**

Once created, go to the database page → **Details** tab → copy the **Redis URL**. It looks like:
```
rediss://default:<password>@<host>.upstash.io:6379
```

Keep this — you'll need it in Step 4.

> The `rediss://` (double s) means TLS. Celery handles this automatically.

---

## Step 3 — Create the Fly.io app

Run this from inside the `server/` directory:

```bash
cd server

# Create the app (skip auto-deploy — we set secrets first)
fly launch --no-deploy --name unimate-backend --region sin
```

When prompted:
- **Would you like to set up a Postgresql database?** → No
- **Would you like to set up an Upstash Redis database?** → No (we're using our own)
- **Would you like to deploy now?** → No

This creates the app on Fly.io and generates/updates `fly.toml`. If it overwrites your fly.toml, restore it from git or re-copy the values from the generated file — our `fly.toml` in this repo has the correct `[processes]` and `[[vm]]` config.

---

## Step 4 — Set secrets (environment variables)

Secrets are encrypted and injected as environment variables at runtime. Never commit them.

```bash
fly secrets set \
  TURSO_URL="libsql://unimate-beelal-k.aws-ap-south-1.turso.io" \
  TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..." \
  GEMINI_API_KEY="your-gemini-api-key" \
  REDIS_URL="rediss://default:<password>@<host>.upstash.io:6379" \
  SECRET_KEY="$(openssl rand -hex 32)" \
  ENVIRONMENT="production"
```

Replace the values:
- `TURSO_URL` / `TURSO_AUTH_TOKEN` → from your `.env` file
- `GEMINI_API_KEY` → from [aistudio.google.com](https://aistudio.google.com) → API Keys
- `REDIS_URL` → the `rediss://` URL from Upstash Step 2
- `SECRET_KEY` → the `openssl` command generates a random one automatically

Optional (for Expo push notifications from the server):
```bash
fly secrets set EXPO_ACCESS_TOKEN="your-expo-token"
```

Verify secrets were saved:
```bash
fly secrets list
```

---

## Step 5 — Deploy

```bash
# Still inside server/
fly deploy
```

This builds the Docker image, pushes it to Fly.io's registry, and starts both process groups. First deploy takes ~3–5 minutes. Subsequent deploys are faster (layer caching).

You'll see output like:
```
==> Building image
...
==> Pushing image to registry
...
==> Creating release
--> release v1 created
==> Monitoring deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy  [web]
 1 desired, 1 placed, 1 healthy, 0 unhealthy  [worker]
--> v1 deployed successfully
```

---

## Step 6 — Verify

```bash
# Check both machines are running
fly status

# Tail live logs
fly logs

# Hit the health endpoint
curl https://unimate-backend.fly.dev/health
```

Expected response:
```json
{"status": "ok", "redis": "connected", "turso": "connected"}
```

If `redis` shows `disconnected`, double-check the `REDIS_URL` secret — make sure it starts with `rediss://` (TLS).

---

## Step 7 — Update the Expo app

Change the API URL in `app/.env`:

```env
EXPO_PUBLIC_API_URL=https://unimate-backend.fly.dev
```

Then restart Expo:
```bash
cd app && npx expo start --clear
```

---

## Ongoing Operations

### View logs
```bash
fly logs                    # live stream
fly logs --process web      # API logs only
fly logs --process worker   # Celery logs only
```

### SSH into a running machine
```bash
fly ssh console --process web
fly ssh console --process worker
```

### Re-deploy after code changes
```bash
cd server && fly deploy
```

### Update a secret
```bash
fly secrets set GEMINI_API_KEY="new-key"
# Fly.io automatically restarts the machines after a secret update
```

### Scale up if needed (paid)
```bash
fly scale vm shared-cpu-2x --process worker   # double CPU for heavy jobs
fly scale memory 512 --process worker         # more RAM for embedding tasks
```

---

## Free Tier Limits

| Resource | Limit | Expected Usage |
|----------|-------|----------------|
| Fly.io VMs | 3 shared-cpu-1x 256MB | 2 (web + worker) |
| Fly.io VM hours | ~2,160/month (3×720) | ~720 (worker always on) + web auto-stops |
| Upstash commands | 10,000/day | ~500–2,000/day depending on job volume |
| Upstash storage | 256MB | <10MB for broker data |
| Turso | 500 reads/day (free), 1GB | Already in use |

> If Upstash commands exceed 10k/day (only happens with very high job volume), upgrade to Upstash Pay-as-you-go ($0.20 per 100k commands — negligible for a student app).

---

## Troubleshooting

**Deploy fails with "no machines created"**
```bash
fly machine list   # check if orphan machines exist
fly apps restart
```

**Worker crashes on startup**
```bash
fly logs --process worker
# Common cause: REDIS_URL wrong format or Upstash IP allowlist blocking Fly.io
# Fix: Upstash → Database → Details → ensure "Allow all IPs" or add Fly.io IPs
```

**`libsql_experimental` install fails during build**
The package has prebuilt wheels for x86_64 Linux. If build fails:
```bash
# In Dockerfile, pin the version that has your platform's wheel
pip install libsql-experimental==0.0.50
```

**API returns 500 on first request after idle**
The web VM auto-starts on request but takes ~2–3 seconds. This is normal — the next request will be instant. To eliminate cold starts entirely: `fly scale count web=1 --region sin` (keeps 1 VM always on, uses more free hours).

**Upstash "max daily command limit" error**
Increase Celery heartbeat interval to reduce Redis chatter:
```python
# In celery_app.py — add to celery.conf.update(...)
broker_heartbeat=120,
worker_send_task_events=False,
```
Then redeploy.
