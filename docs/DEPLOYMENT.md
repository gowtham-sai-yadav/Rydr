# Deploying Rydr

Database, then API, then web. The order matters: the API needs the database
URL, and the frontend bakes the API URL in at build time.

Everything below fits inside free tiers.

## Why this split

| Piece | Host | Why |
|---|---|---|
| Postgres | Neon (or Render) | Managed, free tier, no ops |
| API (FastAPI) | Render | Long-lived process. The chat WebSocket needs one; serverless functions cannot hold a socket open |
| Web (Next.js) | Vercel | Built for Next.js, free, global CDN |

Do not put the API on Vercel. Two of its routers serve WebSockets, and
Vercel's functions are short-lived, so live chat would fail.

---

## 1. Database

**Neon** ([neon.tech](https://neon.tech)) is the default recommendation: the
free tier does not expire.

1. Create a project, region closest to your users.
2. Copy the **pooled** connection string. It looks like:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/rydr?sslmode=require`
3. Keep it for step 2.

Use the pooled endpoint, not the direct one. The API opens a connection per
worker plus one per live WebSocket, and the direct endpoint has a much lower
connection ceiling.

**Alternative:** Render can provision Postgres itself via `render.yaml`, which
is one click fewer. Its free tier **expires after 30 days and is then deleted**,
so only take that path for a short-lived demo.

## 2. API

Render dashboard → **New → Blueprint** → select this repository. It reads
`render.yaml` and creates the database and the API service.

Set the variables marked `sync: false`, which Render deliberately will not
guess:

| Variable | Value |
|---|---|
| `ALLOWED_ORIGINS` | Your Vercel URL. Unknown until step 3 — set it then. |
| `MAPBOX_TOKEN` | Optional now, required before real traffic (see §5). |
| `CLOUDINARY_*` | Optional. Blank disables photo upload; URL attach still works. |

If you used Neon, replace the `DATABASE_URL` value with your Neon string
instead of the generated one.

On first boot the container runs migrations and then seeds the catalogue and
the demo activity, because `SEED_ON_START=true`. Watch the deploy log for:

```
[entrypoint] running migrations...
[entrypoint] seeding demo data...
[entrypoint] starting: uvicorn app.main:app ...
```

Verify:

```bash
curl https://rydr-api.onrender.com/api/health/ready
# {"status":"ok","database":"ok"}
```

**Turn `SEED_ON_START` off after the first successful deploy.** It is
idempotent, but leaving it on means every restart re-runs seeding against
whatever the database holds by then.

## 3. Web

Vercel → **Add New → Project** → import the repository.

- **Root Directory:** `frontend`
- **Environment variable:** `NEXT_PUBLIC_API_URL` = your Render URL
  (e.g. `https://rydr-api.onrender.com`), no trailing slash

Deploy.

`NEXT_PUBLIC_*` values are compiled into the bundle, not read at runtime.
Changing the API URL later needs a **redeploy**, not a restart.

## 4. Close the CORS loop

Back in Render, set `ALLOWED_ORIGINS` to the Vercel domain:

```
ALLOWED_ORIGINS=https://rydr.vercel.app
```

Comma-separate to allow more than one. Miss this step and every browser
request fails CORS while `curl` keeps working — the single most common way
this deploy goes wrong.

Restart the API, then sign in at your Vercel URL with `deb@gmail.com` /
`password123`.

## 5. Before real users

The deploy works without these. Do not leave them undone if the site is
public.

- **Maps.** The default OSRM and Nominatim endpoints are donated
  infrastructure. Nominatim's policy caps use at **1 request/second** and
  forbids autocomplete; a public site breaches it. Set `MAPBOX_TOKEN` (free
  tier: 50k loads/month) and every map, route and geocode call moves over with
  no code change.
- **Rate limiting.** There is none. Signup, posting and chat are unthrottled.
- **Account deletion.** No in-app path exists. Required by Google Play, and
  expected by most privacy regimes.
- **Error tracking.** `app/observability.py` emits structured JSON logs with a
  request id; it is where a Sentry SDK would initialise.

## 6. Known ceilings

**One API worker, by design.** `backend/Dockerfile` pins `--workers 1` because
the WebSocket registry lives in process memory: a second worker would silently
drop chat messages between riders connected to different workers. Scaling out
needs a Redis pub-sub layer between workers; `services/ws_manager.broadcast` is
the only function that changes.

**Render free tier sleeps** after 15 minutes idle, and the next request takes
30–60 seconds to wake it. Fine for a demo if you warm it first; not fine for a
live audience. Hit the URL a minute before you present, or take the paid tier.

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| Browser shows "Failed to fetch", `curl` works | `ALLOWED_ORIGINS` missing the Vercel domain |
| Login returns 500 | Migrations did not run; check the deploy log |
| Feed and leaderboards empty | `SEED_ON_START` was never true; run the seeders manually |
| First request takes 60s | Free-tier cold start |
| Maps blank | Bad `MAPBOX_TOKEN`, or URL restrictions excluding your domain |
| Photo upload returns 503 | Cloudinary keys not set — expected without them |

Seed manually against a remote database:

```bash
export DATABASE_URL='postgresql://...'
cd backend
python -m alembic upgrade head
python -m app.seed && python scripts/seed_badges.py && python scripts/seed_demo.py
```
