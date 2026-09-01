# Who Built What

Rydr was built by three people. This document says who owns which part, so each
of us can explain our own work and answer questions on it.

**One thing to check before the viva:** read your own section and confirm it
matches what you actually did. Adjust it if it does not. It is much worse to
claim an area and then be unable to answer a question on it than to say plainly
"that part was my teammate's, here is what I did instead".

---

## The three of us

| Person | Main area | One-line summary |
|---|---|---|
| **Gowtham Sai G** | Backend core and deployment | The rules of the system, and getting it live on the internet |
| **Navneet** | Web application | Everything a rider sees in the browser |
| **Debashis Maharana** | Community features and mobile app | Clubs, events, trips, and the phone app |

We worked on branches and merged through pull requests, so each person's work
has a reviewable history rather than one large upload.

---

## Gowtham Sai G — Backend core and deployment

**Owns**

- The layered backend design: API layer, service layer, database layer, and the
  rule that each layer only talks to the one below it
- Login and security: tokens, password hashing, who is allowed to see what
- Seat counting and the waiting list, including the database locking that stops
  two riders getting the same last seat
- The badge engine and leaderboards
- Live chat over WebSockets, with a fallback so no message is lost
- Cost estimation and distance calculation
- The 104 automated tests
- Database migrations — 20 numbered files that build the schema from empty
- Deployment: backend on Render, website on Vercel, database on Supabase

**Be ready to explain**

- Why we lock a database row instead of checking seats in code
- Why extra steps like notifications run in their own protected block, so a
  failed notification cannot undo an approved rider
- Why the chat saves the message to the database before sending it
- Why the system is split across three hosting services instead of one
- Why we test through the real API instead of testing small functions

**Good demo to run:** open a ride that is full, request to join, show it goes to
the waiting list, then have the captain free a seat and show the first person in
the queue gets promoted automatically.

---

## Navneet — Web application

**Owns**

- All 30 pages of the website, built with Next.js and React
- Destination search and filtering — by distance, road type, cost and tags
- The map view with grouped pins, and the journey planner where you drag points
  to sketch a route
- Ride pages: creating a ride, browsing rides, the ride detail view
- The community feed, likes and comments
- Rider profiles, followers and following
- The leaderboard and badge screens
- The admin screen for reported content
- The dark visual design and the shared style tokens
- Making the site work on a phone browser as well as a desktop

**Be ready to explain**

- How the frontend talks to the backend, and why the two never share code —
  only an agreed shape of data
- Why the map library only draws the map, and the map images come from a
  provider the backend chooses
- How the app knows a rider is logged in, and what happens when the token expires
- Why we used type checking and a production build as our correctness check
  instead of a separate frontend test tool, and that we listed this as a limit

**Good demo to run:** filter destinations down to something specific, open one,
show the personalised fuel cost, then show the same page as a logged-out visitor
and point out what changes.

---

## Debashis Maharana — Community features and mobile app

**Owns**

- Clubs: riding groups tied to a city, with members, admins, club-only badges
  and monthly distance challenges
- Events: public rides and meetups with a date, a meeting point and open RSVP
- Multi-day trips: grouping several ride logs into one tour with combined totals
- Hazard reports: potholes, gravel and police checks pinned to the map, which
  fade out on their own over time instead of needing manual cleanup
- The ridden-ground heatmap, including blurring each rider's own home area for
  privacy
- The full Expo / React Native mobile app — 39 screens under a five-tab layout
- The Capacitor Android shell around the website

**Be ready to explain**

- The difference between a club, a group ride and an event, and why all three
  exist rather than one
- How hazard reports expire without a scheduled cleanup job
- Why the mobile app shares no code with the website, only the API
- Why the mobile app is verified but not yet a signed Play Store file, and what
  is needed to finish that

**Good demo to run:** open a club, show its members and monthly challenge
progress, then open the same account on the mobile app and show it reading the
same live data.

---

## Things all three of us should be able to say

These come up no matter who is asked.

**What is the main idea of the project?**
Everything attaches to a destination. A ride, its photos and its rating do not
disappear when the ride ends — they improve the destination page for the next
rider. That loop is the point of the project.

**What is the biggest technical problem you solved?**
Two riders being approved for the last seat at the same moment. We solved it by
locking the ride row in the database, and we have a test that runs both
approvals together and proves only one succeeds.

**What would you do next?**
Run the chat across more than one server, which needs a shared message channel
between them. We already know the single function that has to change.

**What is not finished?**
Live GPS tracking, payments, push notification sending, and a signed Android
release. All four are listed as future work in the report, not hidden.

**How do we know it works?**
104 automated tests pass against a real database. The website builds with no
type errors. The whole system runs from one command with Docker, and it is
deployed and reachable on the internet right now.

---

## Numbers, if asked

| Item | Count |
|---|---|
| Backend route files | 22 |
| API endpoints | 141 |
| Database tables | 41 |
| Database migrations | 20 |
| Website pages | 30 |
| Mobile screens | 39 |
| Automated tests | 104, all passing |
| Badges | 16 |
| Lines of code | about 48,000 |

Live website: rydr-web.vercel.app
Live backend: rydr-api-eq6i.onrender.com
