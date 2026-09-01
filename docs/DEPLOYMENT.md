# Deploying Rydr

Database, then API, then web. The order matters: the API needs the database
URL, and the frontend bakes the API URL in at build time.

Everything below fits inside free tiers.

## Why this split

| Piece | Host | Why |
|---|---|---|
| Postgres | Supabase | Managed, free tier, does not expire |
| API (FastAPI) | Render | Long-lived process. The chat WebSocket needs one; serverless functions cannot hold a socket open |
| Web (Next.js) | Vercel | Built for Next.js, free, global CDN |

Do not put the API on Vercel. Two of its routers serve WebSockets, and
Vercel's functions are short-lived, so live chat would fail.

---

## 1. Database

**Supabase** ([supabase.com](https://supabase.com)). The free tier does not
expire, unlike Render's, which is deleted 30 days after creation.

1. Create a project. **Pick the region your API runs in**, not the one nearest
   you — the API talks to the database on nearly every request, so a database
   on another continent adds its round trip to all of them. This deployment
   uses `us-west-1` because the Render service is in Oregon. The region cannot
   be changed later.
2. Project Settings → Database → **Session pooler** → copy that string.
3. Append `?sslmode=require`.

### Take the session pooler, not the other two

Supabase offers three connection strings and two of them fail here:

| | Host | Verdict |
|---|---|---|
| Direct | `db.<ref>.supabase.co:5432` | **No.** IPv6-only; Render has no IPv6 egress, so the connection hangs rather than failing cleanly |
| Transaction pooler | `...pooler.supabase.com:6543` | **No.** pgBouncer transaction mode disables prepared statements, which breaks Alembic |
| Session pooler | `...pooler.supabase.com:5432` | **Yes.** IPv4, full Postgres semantics |

Check the string has `pooler.supabase.com`, port `5432`, and a username
shaped like `postgres.<project-ref>` — the pooler routes on that suffix.

### Choose a password with no URL-special characters

Pick something alphanumeric. A password containing `@ : / ? #` has to be
percent-encoded to survive a URL, and encoding it introduces a second problem:
`%` is interpolation syntax to the configparser behind Alembic's config.
`alembic/env.py` escapes it now, but the whole class of problem disappears if
the password never needs encoding.

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

`DATABASE_URL` is `sync: false` in `render.yaml` and is set by hand — paste
the Supabase session-pooler string. It is deliberately not bound to the
`databases:` block: `fromDatabase` overwrites a hand-set value on every
Blueprint sync, so the two cannot coexist.

**Paste it into an empty field.** Browsers treat that input as a credentials
field and will autofill an email address into it. An `@` from an autofilled
address splits the URL early, and psycopg2 then reads everything after it as
the hostname.

Seeding is off by default. For the first deploy against an empty database set
both `SEED_ON_START=true` and `SEED_FRESH=true` in the dashboard, then set them
back. Watch the deploy log for:

```
[entrypoint] running migrations...
[entrypoint] seeding demo data...
[entrypoint] starting: uvicorn app.main:app ...
```

Verify:

```bash
curl https://rydr-api-eq6i.onrender.com/api/health/ready
# {"status":"ok","database":"ok"}
```

**Set `SEED_ON_START` back to `false` afterwards.** The seeders skip rows that
already exist, but they still generate a *new* batch of rides and posts each
run, so leaving it on means every deploy quietly inflates the demo data.

Both flags carry `value: "false"` in `render.yaml` rather than `sync: false`,
which is deliberate: a Blueprint sync rewrites every variable it declares a
value for, so a dashboard change survives only until the next sync. Defaulting
to `false` makes that overwrite harmless — a sync can turn seeding off, never
silently back on.

## 3. Web

Vercel → **Add New → Project** → import the repository.

- **Root Directory:** `frontend`
- **Environment variable:** `NEXT_PUBLIC_API_URL` = your Render URL
  (e.g. `https://rydr-api-eq6i.onrender.com`), no trailing slash

Deploy.

`NEXT_PUBLIC_*` values are compiled into the bundle, not read at runtime.
Changing the API URL later needs a **redeploy**, not a restart.

## 4. Close the CORS loop

Back in Render, set `ALLOWED_ORIGINS` to the Vercel domain:

```
ALLOWED_ORIGINS=https://rydr-web.vercel.app
```

Comma-separate to allow more than one. Miss this step and every browser
request fails CORS while `curl` keeps working — the single most common way
this deploy goes wrong.

Restart the API, then sign in at your Vercel URL with any seeded account, e.g.
`alex@ryder.com` / `password123`.

## 5. Before real users

The deploy works without these. Do not leave them undone if the site is
public.

- **Maps.** The default OSRM and Nominatim endpoints are donated
  infrastructure. Nominatim's policy caps use at **1 request/second** and
  forbids autocomplete; a public site breaches it. Set `MAPBOX_TOKEN` (free
  tier: 50k loads/month) and routing, geocoding and static images move over
  with no code change. It is set in this deployment.

  Two rules for that token:

  - It must be a **public** (`pk.*`) token. `/api/maps/config` embeds it in the
    tile URL it hands the browser, so a secret (`sk.*`) token would ship
    account-write access to every visitor.
  - It must carry **no URL restrictions**. Mapbox enforces those with the
    `Referer` header, which the server-side routing, geocoding and
    static-image calls do not send — a restricted token 403s exactly those
    three while tiles keep working.

  Note that the *rendering* library is Leaflet either way. Mapbox supplies
  tiles and data; Mapbox GL JS is not used. Four of the five map components
  currently hardcode OpenStreetMap tiles, so setting the token changes routing
  and geocoding but not what those maps look like.
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
| Web app calls `localhost:8000` | `NEXT_PUBLIC_API_URL` was set after the build. It is compiled in, so it needs a **redeploy**, not a restart |
| Login returns 500 | Migrations did not run; check the deploy log |
| Feed and leaderboards empty | Seeding never ran; set `SEED_ON_START=true` for one deploy |
| Clubs and events empty but the rest is full | `seed_demo.py` did not run — it seeds those, `app/seed.py` does not |
| Weekly leaderboards empty, everything else fine | Seeded data is older than the current week. Re-run `seed_demo.py --fresh` |
| `could not translate host name "…@…pooler.supabase.com"` | An autofilled email landed in `DATABASE_URL`. psycopg2 splits on the first `@` and reads the rest as the host |
| `ValueError: invalid interpolation syntax` during migrations | A `%` in the password reaching configparser. Fixed in `alembic/env.py`; if it reappears, check that escaping |
| Entrypoint prints `waiting for the database` then nothing | Host unreachable. The probe prints the real error after 60s — read it rather than guessing |
| First request takes 60s | Free-tier cold start |
| Maps blank | Bad `MAPBOX_TOKEN`, or URL restrictions on it (see §5) |
| Photo upload returns 503 | Cloudinary keys not set — expected without them |

Seed manually against a remote database:

```bash
export DATABASE_URL='postgresql://...'
cd backend
python -m alembic upgrade head
python -m app.seed && python scripts/seed_badges.py && python scripts/seed_demo.py
```

All three matter. `app/seed.py` builds the catalogue (users, destinations,
tags) and returns early if tags already exist. `seed_badges.py` loads the badge
definitions. `seed_demo.py` layers the activity every screen actually renders —
rides, logs, posts, chat, clubs, events — and takes `--fresh` to rebuild rather
than add to what is there.

## 8. Security notes

- **Row Level Security is off** on every table. Supabase exposes a REST API
  over them to anyone holding the project's anon key. This app never uses that
  key — it connects as `postgres` over the pooler — so nothing is published,
  but the surface exists and did not on Render. Enabling RLS with no policies
  closes it without affecting the app, because the connecting role owns the
  tables and Postgres exempts owners.
- **Tracebacks can print the connection string.** The readiness probe masks the
  password, but a failure deeper in the stack (Alembic, SQLAlchemy) may not. If
  one reaches the logs, rotate the database password.
