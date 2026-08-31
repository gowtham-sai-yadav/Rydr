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
from app.models.destination import Destination, Rating  # noqa: E402
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
            near = sorted(dests, key=lambda d: haversine_km(
                u.home_latitude, u.home_longitude, d.latitude, d.longitude))[:6]
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
        for _ in range(random.randint(2, 4)):
            captain = random.choice(everyone)
            dest = random.choice(nearby[captain.id])
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
                if random.random() > 0.65:
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


def main() -> None:
    db = SessionLocal()
    try:
        if "--fresh" in sys.argv:
            rides_gone, posts_gone = purge_previous(db)
            print(f"  purged: {rides_gone} rides, {posts_gone} orphaned posts")
        added = backfill_destinations(db)
        print(f"  destinations backfilled : {added}")
        riders = get_or_create_riders(db)
        print(f"  demo riders ensured     : {len(riders)}")
        stats = build_activity(db, riders)
        for k, v in stats.items():
            print(f"  {k:24}: {v}")
        refresh_rollups(db)
        print(f"  badges awarded total    : {db.query(UserBadge).count()}")
        print("\n  demo accounts: any @rydr.app or @ryder.com address, password "
              f"'{DEMO_PASSWORD}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
