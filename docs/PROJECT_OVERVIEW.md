# Rydr — Project Overview

A short guide to what we built, how it works, and why we made the choices we
made. Written to be read in about ten minutes.

---

## 1. What the app does

Rydr helps motorcycle riders answer one question: **where should I ride this
weekend, and who is coming with me?**

Today a rider uses three or four different apps for this. Google Maps finds the
shortest road, but it does not know which roads are *fun* to ride. WhatsApp
groups plan the trip, but nobody can see who actually confirmed. Photos end up
in a phone gallery and help nobody.

Rydr puts all of it in one place, and everything is attached to a **destination**.

The key idea is a loop:

1. A rider searches for a destination and filters by distance, road type and cost
2. They create a group ride to it, and other riders ask to join
3. The group chats in real time while planning and riding
4. After the ride, the rider logs it with a rating, a review and photos
5. That log goes back onto the destination page

So the next rider who searches for that place sees a better page than the last
one did. Every ride makes the app more useful. We call this the flywheel.

---

## 2. How a request flows through the system

Take one example: a rider opens a destination page.

```
Browser
   |  sends GET /api/destinations/{id} with a login token
   v
API layer (FastAPI)
   |  checks the token, decides who is asking
   v
Service layer
   |  works out the fuel cost for this rider's bike
   v
Database (PostgreSQL)
   |  returns the destination, its tags, photos and rating
   v
Browser
      shows the page
```

The rule we follow everywhere: **each layer only talks to the layer below it.**

- The API layer never runs SQL directly
- The service layer holds all the real logic (cost, badges, distance, chat)
- Only the service layer talks to the database or to outside services

This sounds like extra work but it paid off. When we wanted to switch our map
provider, we changed one file in the service layer. No page, no screen and no
API route had to change.

---

## 3. The parts of the system

**Backend** — one Python program built with FastAPI. It owns all the rules and
is the only thing that touches the database. 22 route files, 141 endpoints.

**Database** — one PostgreSQL database, 41 tables. Every change to the shape of
the database is a numbered migration file, so anyone can rebuild it from empty.

**Web app** — a Next.js website, 30 pages. It only talks to the backend through
the API.

**Mobile app** — an Expo / React Native app, 39 screens. It talks to the *same*
API as the website. No shared code, just a shared contract.

**Outside services** — Cloudinary stores photos and videos. OpenStreetMap or
Mapbox supplies map tiles, routes and place search.

---

## 4. Technology we used, and why

| What | Why we picked it |
|---|---|
| **FastAPI** (backend) | Writes its own API documentation from the code, and checks every request against a defined shape before our code runs. Fewer bugs from bad input. |
| **PostgreSQL** (database) | Our data is highly connected — riders, rides, logs, destinations. A relational database enforces those links. It can also stop two people booking the same seat, which we needed. |
| **SQLAlchemy + Alembic** | Lets us write database queries in Python and keep every schema change as a numbered file, so the database can be rebuilt from scratch on any machine. |
| **Next.js + React** (web) | Fast page loads, good routing, and it deploys to Vercel with no configuration. |
| **Expo / React Native** (mobile) | One codebase for a real phone app, without needing separate Android and iOS teams. |
| **Leaflet** (maps) | A small, free map library. It draws the map; the map images come from a provider we can swap. |
| **JWT tokens** (login) | The backend does not have to remember who is logged in. The token carries it. This means we could add a second server later without sharing login state. |
| **Docker** | The whole system starts with one command on any machine. Removes "it works on mine". |
| **pytest** | 104 automated tests that run against a real database, not a fake one. |

---

## 5. Trade-offs we thought about

These are the decisions where we picked one thing and gave something up.

### Estimated distance instead of live GPS tracking

We calculate distance from the rider's home to the destination using a formula,
rather than recording their actual GPS trail.

*What we gave up:* exact distances.
*Why:* live GPS needs the app open and the screen on for hours, drains battery,
and raises privacy questions we did not want to answer casually. Every number in
the app is clearly labelled as an estimate. We would rather show an honest
estimate than a precise-looking number we cannot back up.

### Locking the database row instead of checking in code

When two riders are approved for the last seat at the same moment, a simple
"check then save" can let both in.

*What we did:* we lock the ride row in the database first, so the second request
waits for the first to finish.
*What we gave up:* a tiny amount of speed.
*Why:* correctness. We have a test that runs two approvals at the same time and
proves only one succeeds.

### One chat server instead of many

Our live chat keeps a list of connected users in the server's memory.

*What we gave up:* the ability to run more than one server copy.
*Why:* it is simple and correct for our size. If we ran two copies, a message
sent on one would not reach users on the other. We wrote down exactly which one
function needs to change to fix this later, so it is a known limit, not a
surprise.

### OpenStreetMap by default, Mapbox behind a switch

Maps can come from free OpenStreetMap or from paid Mapbox.

*What we did:* built both, and made the choice a single setting.
*Why:* free maps mean no account and no usage limit, which is right for a
college project. But free public map servers ask you not to send heavy traffic.
So we built the Mapbox path too and tested it live. Switching is one environment
variable, no code change.

### Side effects that fail safely

When a rider is approved for a ride, we also send a notification and maybe award
a badge.

*What we did:* those extra steps run inside their own protected block.
*Why:* if the notification fails, the rider must still stay approved. The
important action should never be undone by an unimportant one.

### Integration tests instead of unit tests

We test through the real API against a real database, rather than testing small
functions in isolation.

*What we gave up:* pinpointing exactly which line broke.
*Why:* most of our bugs are about several tables and requests interacting, not
about one function returning the wrong number. Testing the real path catches
those; testing one function at a time would miss them.

### Three hosting services instead of one

The backend runs on Render, the website on Vercel, the database on Supabase.

*Why not one place?* The chat needs a connection that stays open for a long
time, and Vercel cannot do that. And Render's free database is deleted after 30
days, while Supabase's is not. Each part sits where it works best.

---

## 6. What we did not build, and why

We were honest about scope rather than pretending everything is done.

- **Live GPS during a ride** — needs continuous location access
- **Payments** — needs a real payment account and legal setup
- **Push notifications** — the app side is built, but sending needs a paid service account
- **Signed Android app on Play Store** — needs Android build tools we did not have

All of these are written down as future work, not hidden.

---

## 7. Common questions and our answers

**Why FastAPI and not Django or Flask?**
Django brings a lot we did not need, like its own admin site and templates,
since our frontend is separate. Flask brings very little and we would have
written the validation ourselves. FastAPI checks every request shape
automatically and writes the API docs from the code.

**Why PostgreSQL and not MongoDB?**
Our data is full of relationships — a ride belongs to a destination, has
participants, produces logs. A relational database enforces those links so bad
data cannot be saved. We also needed row locking for the seat problem, which
document databases do not give us in the same way.

**Why Leaflet and not Mapbox GL JS?**
Leaflet only draws the map, so we can feed it images from any provider. Mapbox
GL JS would have tied us to Mapbox. We wanted the freedom to switch, and we
proved it works with both.

**Why not just check seats in code instead of locking the database?**
Because two requests can both pass the check before either one saves. The
database lock is the only thing that makes it impossible. We have a test that
proves it.

**Why 104 tests and not more?**
We aimed for the paths where a bug would be silent — seat counting, waitlists,
badges, permissions. A test that only repeats what the code obviously does adds
little.

**Why do you store chat messages in the database if it is live chat?**
Because a live connection can drop. We save the message first, then send it. If
someone's connection dies, they fetch what they missed. A lost connection costs
a reload, never a lost message.

**Is the app finished?**
The web app is feature-complete and deployed. The mobile app works and is
verified, but is not packaged as an installable Play Store file. We list that as
remaining work rather than claiming otherwise.
