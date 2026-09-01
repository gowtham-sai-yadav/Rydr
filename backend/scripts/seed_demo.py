#!/usr/bin/env python
"""Rich demo data for a live walkthrough.

`app/seed.py` builds the catalogue: users, tags and destinations. This script
layers realistic *activity* on top of it, which is what the Phase 4 screens
actually render. Without it the feed, leaderboards, streaks and notification
bell are all empty states.

Where the content comes from
----------------------------
Destinations, coordinates and photos come from `app/seed.py`, which sources
real places and Wikimedia Commons imagery.

Ride recaps, reviews and chat are written for this file rather than scraped.
Review text on other platforms belongs to the people who wrote it, and copying
it would put real strangers' words into a demo under someone else's name.
Authored content also lets each entry reference the specific destination it is
attached to, which reads as far more genuine than generic filler.

Design notes
------------
Rides are dated backwards from today across roughly ten weeks so that streaks,
"this month" leaderboards and the weekly stats panel all have something real to
compute. Distances are derived from the rider's home to the destination and
back, matching how `services/stats` estimates them, so the dashboard and the
leaderboard agree with the ride log.

Idempotent: every insert is guarded, so running it twice adds nothing. Safe to
re-run after `./run.sh reset`.
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, datetime, time, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal  # noqa: E402
from app.models.badge import UserBadge  # noqa: E402
from app.models.chat import ChatGroup, ChatMessage  # noqa: E402
from app.models.club import (  # noqa: E402
    Club,
    ClubBadge,
    ClubChallenge,
    ClubMembership,
    ClubRole,
    UserClubBadge,
)
from app.models.destination import Destination, Rating  # noqa: E402
from app.models.event import Event, EventRSVP, RSVPStatus  # noqa: E402
from app.models.post import Post, PostComment, PostLike, PostMedia  # noqa: E402
from app.models.ride import (  # noqa: E402
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.models.ride_log import MediaType, RideLog, RideMedia, RoadCondition  # noqa: E402
from app.models.social import Follow  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import create_user  # noqa: E402
from app.services.badge_engine import evaluate_user_badges  # noqa: E402
from app.services.geo import haversine_km  # noqa: E402

random.seed(20260831)  # deterministic: the same demo every run

# A weekend ride has a plausible ceiling. Pairing riders with destinations at
# random across a country this size produced 2,500km "day rides" - a Kochi
# rider sent to Uttarakhand - which made every distance on the leaderboard and
# the stats dashboard obviously synthetic. Riders now only get destinations
# within this one-way radius of home, so round trips land in the 60-700km band
# that real rides occupy.
MAX_ONE_WAY_KM = 350

TODAY = date.today()
DEMO_PASSWORD = "password123"

# Riders added on top of the six in app/seed.py. Home cities are real, with
# coordinates, because every distance in the app derives from them.
RIDERS = [
    ("Aditya Kulkarni", "aditya@rydr.app", "Pune", 18.5204, 73.8567,
     "Weekend Ghat rider. Will detour 40km for good filter coffee."),
    ("Meera Nair", "meera@rydr.app", "Kochi", 9.9312, 76.2673,
     "Coastal roads and backwaters. Rides a Himalayan, packs light."),
    ("Rohit Sharma", "rohit@rydr.app", "Bengaluru", 12.9716, 77.5946,
     "Sunrise runs before work. Nandi regular, Coorg when there's a long weekend."),
    ("Priya Iyer", "priya@rydr.app", "Chennai", 13.0827, 80.2707,
     "ECR at 5am is the best road in the country and I will not be arguing."),
    ("Karan Bedi", "karan@rydr.app", "Delhi", 28.6139, 77.2090,
     "Himalayan season rider. Spiti twice, Ladakh once, knees intact."),
    ("Sneha Rao", "sneha@rydr.app", "Bengaluru", 12.9716, 77.5946,
     "Slow rides, long breaks, lots of photos."),
]

# Ride titles read like something a captain would actually type.
RIDE_TITLES = [
    "{d} sunrise run", "Early start to {d}", "{d} and back before lunch",
    "Long way round to {d}", "{d} breakfast ride", "Post-monsoon {d} run",
    "{d} — taking the old road", "Weekend {d} loop",
]

NOTES = [
    "Left at 5, beat the traffic out of town. Surface was good until the last stretch, then broken tarmac for about 6km. Worth it for the view at the top.",
    "Rained the last 20 minutes. Nothing serious but the descent got slippery. Take it easy on the hairpins if it's wet.",
    "Perfect road. Fresh tarmac most of the way, almost no trucks before 7am. This is the one to bring a new rider on.",
    "Lots of gravel on the corners from the roadwork. Doable on a 150 but you'll want to be awake for it.",
    "Fuel stop halfway is the only one, so top up before you leave. Chai stall next to it is very good.",
    "Busier than expected for a weekday. Left later than planned and paid for it on the way back.",
    "Cold at the top, colder than the forecast said. Bring a layer even in October.",
    "Road has been resurfaced since the last time I came. Completely different ride now, much smoother.",
]

REVIEWS = [
    ("Genuinely one of the better roads near the city. Go early, it fills up by 8.", 5),
    ("Great ride out, but the last few kilometres are rough. Fine on an ADV, less fun on a commuter.", 4),
    ("Scenery is worth the distance. Parking at the top is chaotic on weekends.", 4),
    ("Did this as a solo run. Quiet, well surfaced, good stops along the way.", 5),
    ("Nice enough but overhyped. Traffic on the approach ruins the first hour.", 3),
    ("Went after the rains and it was green the whole way. Best time to do it.", 5),
    ("Good road, poor food options nearby. Carry something.", 4),
]

POSTS = [
    "Finally did {d} properly instead of turning back halfway. {km}km round trip, home before the heat.",
    "{d} this morning. Left at 5, back by 11. The road has been resurfaced and it is a completely different ride now.",
    "Took a new rider to {d} today. Good first long ride — steady road, sensible traffic, one proper climb.",
    "{km}km to {d} and back. Third time this month and I still take the same photo at the same corner.",
    "{d} after the rain. Everything green, almost no one on the road. Worth the early alarm.",
    "Chain snapped 20km short of {d}. Sat by the road for an hour. Still counting it.",
    "{d} done. Fuel, food and entry came to under ₹{cost} for the day, which is the cheapest good ride I know.",
]

COMMENTS = [
    "How was the surface past the checkpost?", "Been meaning to do this one. What time did you leave?",
    "Great shot.", "Did you stop at the usual place for breakfast?",
    "Adding this to the list for next weekend.", "How's it on a 150?",
    "That corner never gets old.", "Was it crowded at the top?",
    "Nice. How long did the climb take?", "Doing this Saturday if anyone's in.",
]

CHAT = [
    "Meeting at the petrol pump at 5:15, don't be late",
    "Anyone carrying a spare tube?", "On my way, 10 mins out",
    "Fuel up before we leave, next pump is 60km",
    "Weather looks clear, no rain forecast until evening",
    "I'll be at the back, still breaking in new tyres",
    "Breakfast stop at the usual place?", "Roads are clear so far",
    "Give me 5, adjusting my chain", "See everyone there",
]


def get_or_create_riders(db) -> list[User]:
    out = []
    for name, email, city, lat, lng, bio in RIDERS:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = create_user(
                db, name=name, email=email, phone=None, password=DEMO_PASSWORD,
                home_city=city, home_latitude=lat, home_longitude=lng,
                bike_name=None, bike_model=None, bike_mileage_kmpl=round(random.uniform(28, 42), 1),
            )
            u.bio = bio
            db.commit()
        out.append(u)
    return out


def backfill_destinations(db) -> int:
    """Load any destination defined in app/seed.py that never made it in.

    The seed guard skips the whole function once a single user exists, so a
    database seeded early is left holding only the destinations that existed
    at that point.
    """
    from app.seed import DESTINATIONS, TAGS  # imported late: heavy module
    from app.models.destination import DestinationTag, Tag, TerrainDifficulty

    tags = {t.slug: t for t in db.query(Tag).all()}
    for slug, label, category in TAGS:
        if slug not in tags:
            t = Tag(slug=slug, label=label, category=category)
            db.add(t); db.flush(); tags[slug] = t

    have = {d.name for d in db.query(Destination).all()}
    added = 0
    for dd in DESTINATIONS:
        if dd["name"] in have:
            continue
        d = Destination(
            name=dd["name"], description=dd["description"], region=dd["region"],
            latitude=dd["latitude"], longitude=dd["longitude"],
            terrain_difficulty=dd["terrain_difficulty"],
            estimated_food_cost=dd["estimated_food_cost"],
            estimated_entry_cost=dd["estimated_entry_cost"],
            best_season=dd["best_season"], best_time_of_day=dd["best_time_of_day"],
            hero_media_url=dd["hero_media_url"],
        )
        db.add(d); db.flush()
        for slug in dd.get("tag_slugs", []):
            if slug in tags:
                db.add(DestinationTag(destination_id=d.id, tag_id=tags[slug].id))
        added += 1
    db.commit()
    return added


def build_activity(db, riders: list[User]) -> dict:
    everyone = db.query(User).filter(User.home_latitude.isnot(None)).all()
    if len(everyone) < 4:
        everyone = db.query(User).all()
    dests = db.query(Destination).all()

    # Precompute each rider's reachable destinations once.
    nearby: dict = {}
    for u in everyone:
        if u.home_latitude is None:
            nearby[u.id] = dests
            continue
        near = [d for d in dests
                if haversine_km(u.home_latitude, u.home_longitude,
                                d.latitude, d.longitude) <= MAX_ONE_WAY_KM]
        # Fall back to the closest handful rather than skipping a rider whose
        # city has nothing catalogued within the radius.
        if len(near) < 3:
            closest = sorted(dests, key=lambda d: haversine_km(
                u.home_latitude, u.home_longitude, d.latitude, d.longitude))[:6]
            # Bounded: a rider whose nearest catalogued destination is 1,400km
            # away gets no rides rather than a 2,800km "day trip".
            near = [d for d in closest
                    if haversine_km(u.home_latitude, u.home_longitude,
                                    d.latitude, d.longitude) <= 600]
        nearby[u.id] = near
    stats = dict(rides=0, logs=0, posts=0, comments=0, likes=0, ratings=0, msgs=0, follows=0)

    # Follow graph: everyone follows 3-5 others.
    for u in everyone:
        for other in random.sample([x for x in everyone if x.id != u.id],
                                   min(random.randint(3, 5), len(everyone) - 1)):
            if not db.query(Follow).filter(Follow.follower_id == u.id,
                                           Follow.followed_id == other.id).first():
                db.add(Follow(follower_id=u.id, followed_id=other.id)); stats["follows"] += 1
    db.commit()

    # Rides spread backwards over ~10 weeks so streaks and "this month" work.
    for week in range(10):
        # Week 0 gives *every* rider a recent ride rather than picking 2-4 at
        # random. Week- and month-scoped views (club leaderboards, challenge
        # progress, the "this week" panel) are per-rider, so a random handful
        # left whole clubs reading zero on demo day.
        if week == 0:
            captains = [u for u in everyone if nearby[u.id]]
        else:
            pool = [u for u in everyone if nearby[u.id]] or everyone
            captains = [random.choice(pool) for _ in range(random.randint(2, 4))]

        for captain in captains:
            if not nearby[captain.id]:
                continue
            dest = random.choice(nearby[captain.id])
            # Week 0 is pinned inside both the current calendar *week* and
            # the current calendar *month*, which are not the same window and
            # neither is "the last 7 days". On a Tuesday, randint(0, 6) puts
            # five of seven outcomes in last week; on the 1st of a month, any
            # backward offset at all lands in the previous month. Either one
            # leaves the scoped leaderboards and challenge progress empty on
            # demo day, so clamp to whichever boundary is closer to today.
            if week == 0:
                floor = max(TODAY - timedelta(days=TODAY.weekday()),
                            TODAY.replace(day=1))
                when = TODAY - timedelta(days=random.randint(0, (TODAY - floor).days))
            else:
                when = TODAY - timedelta(days=week * 7 + random.randint(0, 6))
            title = random.choice(RIDE_TITLES).format(d=dest.name)
            if db.query(RidePlan).filter(RidePlan.title == title,
                                         RidePlan.planned_date == when).first():
                continue

            ride = RidePlan(
                destination_id=dest.id, captain_id=captain.id, title=title,
                description=f"Meeting early and heading out to {dest.name}. "
                            f"{dest.best_time_of_day or 'Early start'}.",
                planned_date=when,
                planned_start_time=time(random.choice([5, 5, 6, 6, 7]), random.choice([0, 15, 30])),
                visibility=RidePlanVisibility.group,
                max_riders=random.choice([4, 6, 8, 10]),
                status=RidePlanStatus.completed,
                thumbnail_url=dest.hero_media_url,
            )
            db.add(ride); db.flush(); stats["rides"] += 1
            db.add(RidePlanParticipant(ride_plan_id=ride.id, user_id=captain.id,
                                       status=ParticipantStatus.approved))

            group = ChatGroup(ride_plan_id=ride.id, name=title)
            db.add(group); db.flush()

            riders_on = [captain]
            plausible = [x for x in everyone
                         if x.id != captain.id and dest in nearby[x.id]]
            for other in random.sample(plausible,
                                       min(random.randint(1, 4), len(plausible))) if plausible else []:
                db.add(RidePlanParticipant(ride_plan_id=ride.id, user_id=other.id,
                                           status=ParticipantStatus.approved))
                riders_on.append(other)

            base = datetime.combine(when, ride.planned_start_time).replace(tzinfo=timezone.utc)
            for i, body in enumerate(random.sample(CHAT, random.randint(3, 6))):
                db.add(ChatMessage(chat_group_id=group.id,
                                   author_id=random.choice(riders_on).id, body=body,
                                   created_at=base - timedelta(hours=8) + timedelta(minutes=i * 7)))
                stats["msgs"] += 1

            # Logs, ratings and posts for a subset, so not every ride looks identical.
            for rider in riders_on:
                # Week 0 is the window every scoped view reads, so its captain
                # always logs. Leaving it to the same 65% dice as the rest meant
                # a rider could end the week with no log at all, which showed up
                # as an entire club leaderboard reading zero.
                captains_recent_ride = week == 0 and rider.id == captain.id
                if not captains_recent_ride and random.random() > 0.65:
                    continue
                one_way = haversine_km(rider.home_latitude, rider.home_longitude,
                                       dest.latitude, dest.longitude) if rider.home_latitude else 0
                km = round(one_way * 2, 1)
                dur = int(km / random.uniform(38, 52) * 3600)
                log = RideLog(
                    ride_plan_id=ride.id, rider_id=rider.id,
                    actual_start_ts=base, actual_end_ts=base + timedelta(seconds=dur),
                    actual_cost=int((dest.estimated_food_cost or 250) +
                                    (dest.estimated_entry_cost or 40) + km * random.uniform(2.4, 3.6)),
                    road_condition=random.choice(list(RoadCondition)),
                    recommended=random.random() > 0.15,
                    notes=random.choice(NOTES),
                    distance_km=km,
                    moving_duration_seconds=dur,
                    avg_speed_kmh=round(km / (dur / 3600), 1) if dur else None,
                    elevation_gain_m=random.randint(150, 1400),
                    created_at=base + timedelta(seconds=dur + 3600),
                )
                db.add(log); db.flush(); stats["logs"] += 1

                if dest.hero_media_url:
                    db.add(RideMedia(ride_log_id=log.id, url=dest.hero_media_url,
                                     media_type=MediaType.image, uploaded_by_user_id=rider.id,
                                     caption=f"{dest.name}, {when.strftime('%b %d')}",
                                     captured_latitude=dest.latitude,
                                     captured_longitude=dest.longitude, captured_at=base))

                if random.random() > 0.4 and not db.query(Rating).filter(
                        Rating.destination_id == dest.id, Rating.user_id == rider.id).first():
                    text, stars = random.choice(REVIEWS)
                    db.add(Rating(destination_id=dest.id, user_id=rider.id, stars=stars,
                                  review=text, ride_log_id=log.id,
                                  created_at=base + timedelta(seconds=dur + 7200)))
                    stats["ratings"] += 1

                if random.random() > 0.5:
                    body = random.choice(POSTS).format(
                        d=dest.name, km=int(km),
                        cost=int((dest.estimated_food_cost or 250) + km * 3))
                    p = Post(author_id=rider.id, body=body, ride_log_id=log.id,
                             destination_id=dest.id,
                             created_at=base + timedelta(seconds=dur + 9000))
                    db.add(p); db.flush(); stats["posts"] += 1
                    if dest.hero_media_url:
                        db.add(PostMedia(post_id=p.id, url=dest.hero_media_url,
                                         media_type="image"))
                    for liker in random.sample(everyone, min(random.randint(1, 6), len(everyone))):
                        if liker.id != rider.id and not db.query(PostLike).filter(
                                PostLike.post_id == p.id, PostLike.user_id == liker.id).first():
                            db.add(PostLike(post_id=p.id, user_id=liker.id)); stats["likes"] += 1
                    for k in range(random.randint(0, 3)):
                        commenter = random.choice([x for x in everyone if x.id != rider.id])
                        db.add(PostComment(post_id=p.id, author_id=commenter.id,
                                           body=random.choice(COMMENTS),
                                           created_at=p.created_at + timedelta(minutes=20 * (k + 1))))
                        stats["comments"] += 1
            db.commit()
    return stats


# ---------------------------------------------------------------- clubs -----
# Clubs are city-anchored because that is how riding groups actually form: the
# thing members have in common is the road they can all reach on a Saturday.
# One deliberate exception (the Himalayan owners' club) is national, so the
# "city" filter on /clubs has both cases to show.
CLUBS = [
    ("Bengaluru Sunrise Riders", "Bengaluru", "rohit@rydr.app",
     "Out of the city before the traffic wakes up. Nandi, Skandagiri, "
     "Kanakapura road. Kickstands up at 5:30, back home before noon."),
    ("Pune Ghat Runners", "Pune", "aditya@rydr.app",
     "Tamhini, Malshej, Varandha. If it has hairpins and fog we have probably "
     "ridden it twice this month. Monsoon is peak season, not an excuse."),
    ("Malabar Coast Riders", "Kochi", "meera@rydr.app",
     "Backwaters, the coastal stretch of NH-66, and the Wayanad ghats when we "
     "want elevation. Slow rides and long lunches — nobody is chasing a time."),
    ("Chennai Coastal Cruisers", "Chennai", "priya@rydr.app",
     "ECR at sunrise, Pondicherry on a long weekend. Beginner friendly: if it "
     "is your first group ride, tell us and someone will ride sweep with you."),
    ("Delhi Ridge Riders", "Delhi", "karan@rydr.app",
     "Weekend escapes out of the NCR — Rishikesh, the Nainital road, and one "
     "properly long haul to Spiti every summer for whoever can get the leave."),
    ("Himalayan Owners Club — India", None, "sneha@rydr.app",
     "Not a city chapter. Anyone riding a Himalayan, anywhere in the country. "
     "Mostly here to argue about luggage setups and share service invoices."),
]

# Two badges per club: one for turning up, one that takes real distance. A club
# with only a hard badge looks unwelcoming; one with only an easy badge looks
# meaningless.
CLUB_BADGES = {
    "Bengaluru Sunrise Riders": [
        ("first-sunrise", "First Sunrise", "Completed your first 5:30am club ride."),
        ("nandi-regular", "Nandi Regular", "Five club rides up Nandi Hills."),
    ],
    "Pune Ghat Runners": [
        ("monsoon-tested", "Monsoon Tested", "Rode a club ghat run in the rain."),
        ("three-ghats", "Three Ghats", "Tamhini, Malshej and Varandha in one season."),
    ],
    "Malabar Coast Riders": [
        ("coast-to-hill", "Coast to Hill", "Sea level to the Wayanad ghats in a single ride."),
        ("long-lunch", "Long Lunch", "Ten club rides. The food stops count."),
    ],
    "Chennai Coastal Cruisers": [
        ("ecr-dawn", "ECR at Dawn", "Your first sunrise run down the East Coast Road."),
        ("rode-sweep", "Rode Sweep", "Rode at the back so a newer rider was never alone."),
    ],
    "Delhi Ridge Riders": [
        ("out-of-ncr", "Out of the NCR", "First club ride past the state line."),
        ("high-pass", "High Pass", "Cleared a pass above 4,000m on a club trip."),
    ],
    "Himalayan Owners Club — India": [
        ("first-service", "First Service", "Survived the first service interval and stayed."),
        ("fully-loaded", "Fully Loaded", "Completed a tour with full luggage fitted."),
    ],
}

# Titles are split past/upcoming because /events defaults to upcoming_only=True.
# A seed weighted to the past would leave the default view empty, which is the
# exact failure this function exists to fix.
UPCOMING_EVENTS = [
    ("{d} sunrise run", "Regular monthly run. Meet at {mp}, brief at 5:20, roll at 5:30. "
     "Fuel up the night before — we are not stopping in the first 40km."),
    ("Breakfast ride to {d}", "Easy pace, one photo stop. Breakfast is the point, the ride "
     "is the excuse. Pillions welcome."),
    ("{d} — new riders' ride", "Built for anyone who has not done a group ride before. "
     "Sweep rider at the back the whole way, no one gets dropped."),
    ("Post-monsoon {d} recce", "Checking what the rain did to the surface before we take "
     "the bigger group up. Expect gravel and at least one detour."),
]

PAST_EVENTS = [
    ("{d} monsoon run", "Rained the whole way. Twelve started, eleven finished, one "
     "electrical gremlin got a tow. Good day regardless."),
    ("{d} — club anniversary ride", "Biggest turnout we have had. Photos in the group, "
     "and thanks to everyone who rode sweep."),
]

# Where a city's group actually gathers before rolling out.
MEETING_POINTS = {
    "Bengaluru": ("Hebbal flyover, service road", 13.0358, 77.5970),
    "Pune": ("Chandni Chowk, NH-48", 18.5074, 73.7898),
    "Kochi": ("Lulu Mall parking, Edappally", 10.0274, 76.3080),
    "Chennai": ("Thiruvanmiyur MRTS, ECR", 12.9830, 80.2594),
    "Delhi": ("India Gate, C-Hexagon", 28.6129, 77.2295),
}


def seed_clubs_and_events(db, riders: list[User]) -> dict:
    """Clubs, their members, badges and challenges, plus dated events.

    Everything is looked up by natural key first, so a second run is a no-op.
    Destinations are chosen by distance from the club's city rather than by
    name, so this keeps working if the destination catalogue changes.
    """
    by_email = {r.email: r for r in riders}
    all_users = db.query(User).all()
    destinations = db.query(Destination).filter(
        Destination.latitude.isnot(None), Destination.longitude.isnot(None)
    ).all()
    counts = {"clubs": 0, "memberships": 0, "club_badges": 0,
              "challenges": 0, "events": 0, "rsvps": 0}

    for club_index, (name, city, creator_email, description) in enumerate(CLUBS):
        creator = by_email.get(creator_email) or (riders[0] if riders else None)
        if creator is None:
            continue

        club = db.query(Club).filter(Club.name == name).first()
        if club is None:
            club = Club(name=name, city=city, description=description,
                        created_by_user_id=creator.id)
            db.add(club)
            db.flush()
            counts["clubs"] += 1

        # The creator runs the club; everyone whose home city matches joins as a
        # member. The national club takes a slice of everyone so it is not empty.
        members = [creator]
        if city is None:
            members += [u for u in all_users if u.id != creator.id][:7]
        else:
            members += [u for u in all_users
                        if u.id != creator.id and (u.home_city or "").lower() == city.lower()]
            # A club of one reads as abandoned. Top up from the wider roster.
            if len(members) < 4:
                extra = [u for u in all_users if u.id != creator.id and u not in members]
                members += extra[: 4 - len(members)]

        for i, user in enumerate(members):
            exists = db.query(ClubMembership).filter(
                ClubMembership.club_id == club.id, ClubMembership.user_id == user.id
            ).first()
            if exists is None:
                db.add(ClubMembership(
                    club_id=club.id, user_id=user.id,
                    role=ClubRole.admin if i == 0 else ClubRole.member,
                ))
                counts["memberships"] += 1

        badge_rows = []
        for slug, badge_name, badge_desc in CLUB_BADGES.get(name, []):
            badge = db.query(ClubBadge).filter(
                ClubBadge.club_id == club.id, ClubBadge.slug == slug
            ).first()
            if badge is None:
                badge = ClubBadge(club_id=club.id, slug=slug, name=badge_name,
                                  description=badge_desc)
                db.add(badge)
                db.flush()
                counts["club_badges"] += 1
            badge_rows.append(badge)

        # Award the participation badge to about half the roster, so the club
        # page shows earned badges rather than an untouched catalogue.
        if badge_rows:
            for user in members[: max(1, len(members) // 2)]:
                held = db.query(UserClubBadge).filter(
                    UserClubBadge.user_id == user.id,
                    UserClubBadge.club_badge_id == badge_rows[0].id,
                ).first()
                if held is None:
                    db.add(UserClubBadge(user_id=user.id, club_badge_id=badge_rows[0].id))

        # A live challenge covering the current month. Progress is computed at
        # read time from members' ride logs, which build_activity already wrote.
        start = TODAY.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        title = f"{start.strftime('%B')} combined distance"
        challenge = db.query(ClubChallenge).filter(
            ClubChallenge.club_id == club.id, ClubChallenge.title == title
        ).first()
        if challenge is None:
            db.add(ClubChallenge(
                club_id=club.id, title=title,
                goal_km=float(500 * max(2, len(members))),
                start_date=start, end_date=end,
                reward_club_badge_id=badge_rows[-1].id if badge_rows else None,
            ))
            counts["challenges"] += 1

        # Events need somewhere to go. Anchor on the club's city when it has
        # one, otherwise on the creator's home, then take the nearest few
        # destinations so a Kochi club is not meeting at Nandi Hills.
        if city and city in MEETING_POINTS:
            mp_name, origin_lat, origin_lng = MEETING_POINTS[city]
        else:
            mp_name = "Group ride — start point shared in the club chat"
            origin_lat = creator.home_latitude
            origin_lng = creator.home_longitude

        if origin_lat is None or origin_lng is None or not destinations:
            db.commit()
            continue

        # Clubs in the same city share a nearest-destination list, which had
        # three of them all running a "Bannerghatta sunrise run". Rotating the
        # window by club index keeps each club's calendar distinct while still
        # only ever picking somewhere they can actually reach.
        ranked = sorted(
            destinations,
            key=lambda d: haversine_km(origin_lat, origin_lng, d.latitude, d.longitude),
        )[:10]
        shift = club_index % max(1, len(ranked) - 3)
        nearby = (ranked[shift:] + ranked[:shift])[:4]

        plan = [(t, d, True) for t, d in zip(UPCOMING_EVENTS, nearby)]
        plan += [(t, d, False) for t, d in zip(PAST_EVENTS, nearby[1:])]

        for offset, ((title_tpl, body_tpl), dest, is_future) in enumerate(plan):
            ev_title = title_tpl.format(d=dest.name)
            ev_body = body_tpl.format(d=dest.name, mp=mp_name)
            existing = db.query(Event).filter(
                Event.club_id == club.id, Event.title == ev_title
            ).first()
            if existing is not None:
                continue

            if is_future:
                when = datetime.combine(
                    TODAY + timedelta(days=6 + offset * 9), time(5, 30)
                ).replace(tzinfo=timezone.utc)
            else:
                when = datetime.combine(
                    TODAY - timedelta(days=14 + offset * 21), time(6, 0)
                ).replace(tzinfo=timezone.utc)

            event = Event(
                club_id=club.id, destination_id=dest.id, title=ev_title,
                description=ev_body, event_date=when, meeting_point=mp_name,
                meeting_latitude=origin_lat, meeting_longitude=origin_lng,
                created_by_user_id=creator.id,
            )
            db.add(event)
            db.flush()
            counts["events"] += 1

            # Most of the club says yes, a couple say maybe. An event with a
            # single RSVP from its own organiser looks broken.
            going = members[: min(len(members), max(3, round(len(members) * 0.7)))]
            interested = members[len(going): len(going) + 2]
            for user in going:
                db.add(EventRSVP(event_id=event.id, user_id=user.id,
                                 status=RSVPStatus.going))
                counts["rsvps"] += 1
            for user in interested:
                db.add(EventRSVP(event_id=event.id, user_id=user.id,
                                 status=RSVPStatus.interested))
                counts["rsvps"] += 1

        db.commit()

    db.commit()
    return counts


def refresh_rollups(db) -> None:
    """Recompute destination rating aggregates and award badges."""
    from sqlalchemy import func, update
    for d in db.query(Destination).all():
        agg = db.query(func.avg(Rating.stars), func.count(Rating.id)).filter(
            Rating.destination_id == d.id).one()
        d.avg_rating = float(agg[0] or 0.0)
        d.rating_count = int(agg[1] or 0)
    db.commit()
    for u in db.query(User).all():
        try:
            evaluate_user_badges(db, u.id)
        except Exception:
            db.rollback()


def purge_previous(db) -> int:
    """Remove activity from an earlier run of this script.

    Identified by the generated ride titles, so hand-made or app-created rides
    are never touched. Cascades take the logs, media, chat and participants.
    """
    patterns = [t.split("{")[0].strip() for t in RIDE_TITLES if t.split("{")[0].strip()]
    killed = 0
    for ride in db.query(RidePlan).all():
        title = ride.title
        if any(title.startswith(p) for p in patterns) or " and back before lunch" in title \
           or title.endswith(" sunrise run") or title.endswith(" breakfast ride") \
           or title.endswith(" loop") or " — taking the old road" in title \
           or title.startswith("Early start to ") or title.startswith("Long way round to ") \
           or title.startswith("Post-monsoon "):
            db.delete(ride); killed += 1
    db.commit()
    # Posts made by this script point at a ride log. Deleting the ride nulls
    # that column rather than cascading (a rider's write-up should outlive the
    # log it describes), so the orphans have to be swept explicitly - filtering
    # on "ride_log_id is not null" misses them precisely because it was nulled.
    # Match on the longest *literal* fragment of each template, not its prefix:
    # several templates open with a placeholder ("{d} done. Fuel, food..."), so
    # a prefix match yields an empty string and silently matches nothing.
    import re as _re
    fingerprints = []
    for template in POSTS:
        literals = [frag for frag in _re.split(r"\{[^}]*\}", template) if len(frag.strip()) > 12]
        if literals:
            fingerprints.append(max(literals, key=len).strip())

    orphans = 0
    for post in db.query(Post).filter(
            Post.ride_log_id.is_(None), Post.destination_id.isnot(None)).all():
        if any(fp in post.body for fp in fingerprints):
            db.delete(post); orphans += 1
    db.commit()
    return killed, orphans


def purge_clubs(db) -> int:
    """Drop the clubs this script creates, matched by exact name.

    Cascades take memberships, badges, challenges, events and RSVPs with them,
    so there is nothing else to sweep. Clubs made through the app survive.
    """
    killed = 0
    for name, *_ in CLUBS:
        club = db.query(Club).filter(Club.name == name).first()
        if club is not None:
            db.delete(club)
            killed += 1
    db.commit()
    # Runs made before the cascade above was corrected left club-less events
    # behind, which no later purge would match. Sweep them once.
    orphans = db.query(Event).filter(Event.club_id.is_(None)).delete(
        synchronize_session=False)
    db.commit()
    return killed, orphans


def main() -> None:
    db = SessionLocal()
    try:
        if "--fresh" in sys.argv:
            rides_gone, posts_gone = purge_previous(db)
            clubs_gone, ev_orphans = purge_clubs(db)
            print(f"  purged: {rides_gone} rides, {posts_gone} orphaned posts, "
                  f"{clubs_gone} clubs, {ev_orphans} orphaned events")
        added = backfill_destinations(db)
        print(f"  destinations backfilled : {added}")
        riders = get_or_create_riders(db)
        print(f"  demo riders ensured     : {len(riders)}")
        stats = build_activity(db, riders)
        for k, v in stats.items():
            print(f"  {k:24}: {v}")
        for k, v in seed_clubs_and_events(db, riders).items():
            print(f"  {k:24}: {v}")
        refresh_rollups(db)
        print(f"  badges awarded total    : {db.query(UserBadge).count()}")
        print("\n  demo accounts: any @rydr.app or @ryder.com address, password "
              f"'{DEMO_PASSWORD}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
