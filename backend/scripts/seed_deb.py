"""Seed extra fixture data for the user ``deb@gmail.com``.

Idempotent — safe to re-run. Adds:
  - Bangalore home location + bike mileage on deb (if missing)
  - 4 BLR-area destinations with Unsplash imagery
  - 4 rides involving deb (1 captained, 3 joined)
        · Skandagiri sunrise — deb captains, planned 6 days out, group
        · Savandurga — sam captains, in_progress today
        · Coorg coffee weekend — alex captains, completed 14 days ago
        · Mekedatu monsoon run — jordan captains, planned 20 days out
  - Hinglish chat messages in each ride's auto-created chat group
  - Follow graph: deb follows alex/sam/jordan;
    alex/sam/jordan/casey follow deb
  - Ride log on the completed Coorg ride with 3 photos + a 5-star rating
    that flows back to the destination via the M4 flywheel
"""
from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path


# Allow running from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func
from app.database import SessionLocal
from app.models.chat import ChatGroup, ChatMessage
from app.models.destination import (
    Destination,
    DestinationMedia,
    DestinationTag,
    Rating,
    Tag,
    TerrainDifficulty,
)
from app.models.ride import (
    Bike,
    BikeType,
    DifficultyLevel,
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.models.ride_log import MediaType, RideLog, RideMedia, RoadCondition
from app.models.social import Follow
from app.models.user import User


def main() -> None:
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


def seed(db) -> None:  # noqa: C901
    # --------------------------------------------------------------------
    # 1. Anchor users
    # --------------------------------------------------------------------
    deb = db.query(User).filter(User.email == "deb@gmail.com").first()
    if not deb:
        print("ERROR: user deb@gmail.com not found — sign up via /signup first.")
        sys.exit(1)
    alex = db.query(User).filter(User.email == "alex@ryder.com").one()
    sam = db.query(User).filter(User.email == "sam@ryder.com").one()
    jordan = db.query(User).filter(User.email == "jordan@ryder.com").one()
    casey = db.query(User).filter(User.email == "casey@ryder.com").one()

    print(f"Found deb: {deb.id} ({deb.name})")

    # --------------------------------------------------------------------
    # 2. Fill in deb's profile if missing — needed for cost estimates
    # --------------------------------------------------------------------
    if not deb.home_latitude or not deb.home_longitude:
        deb.home_city = "Bangalore"
        deb.home_latitude = 12.9716
        deb.home_longitude = 77.5946
        print("  set home_location: Bangalore (12.97, 77.59)")
    if not deb.bike:
        db.add(Bike(
            user_id=deb.id,
            name="Bolt",
            model="Royal Enfield Classic 350",
            year=2023,
            engine_cc=349,
            mileage_kmpl=35.0,
            type=BikeType.cruiser,
        ))
        print("  created bike: Royal Enfield Classic 350")
    else:
        bike = deb.bike
        if bike.mileage_kmpl is None:
            bike.mileage_kmpl = 35.0
        if bike.engine_cc is None:
            bike.engine_cc = 349
        if bike.year is None:
            bike.year = 2023
        if not bike.model:
            bike.model = "Royal Enfield Classic 350"
        if bike.type == BikeType.any:
            bike.type = BikeType.cruiser
        print(f"  bike: {bike.name} {bike.model}, mileage {bike.mileage_kmpl} kmpl")

    db.commit()

    # --------------------------------------------------------------------
    # 3. Destinations near BLR
    # --------------------------------------------------------------------
    def tag(slug):
        return db.query(Tag).filter(Tag.slug == slug).one()

    def get_or_create_destination(name: str, **kwargs) -> Destination:
        existing = db.query(Destination).filter(Destination.name == name).first()
        if existing:
            return existing
        d = Destination(name=name, **kwargs)
        db.add(d)
        db.flush()
        return d

    def attach_tag(dest: Destination, slug: str) -> None:
        t = tag(slug)
        exists = (
            db.query(DestinationTag)
            .filter(DestinationTag.destination_id == dest.id, DestinationTag.tag_id == t.id)
            .first()
        )
        if not exists:
            db.add(DestinationTag(destination_id=dest.id, tag_id=t.id))

    def add_media(dest: Destination, url: str, caption: str | None = None) -> None:
        exists = (
            db.query(DestinationMedia)
            .filter(DestinationMedia.destination_id == dest.id, DestinationMedia.url == url)
            .first()
        )
        if not exists:
            db.add(DestinationMedia(
                destination_id=dest.id, url=url, caption=caption,
            ))

    skandagiri = get_or_create_destination(
        "Skandagiri",
        description=(
            "Pre-dawn sunrise hike-meets-ride spot near Chikkaballapur. "
            "The road snakes through Nandi-style hairpins; the rock face waits at the top. "
            "Around 60 km from Bangalore on NH 44."
        ),
        region="Karnataka",
        country="India",
        currency="INR",
        latitude=13.4239,
        longitude=77.7892,
        terrain_difficulty=TerrainDifficulty.moderate,
        estimated_food_cost=250,
        estimated_entry_cost=200,
        best_season="Oct–Mar",
        best_time_of_day="Start 3 AM to catch the sunrise",
        hero_media_url="https://images.unsplash.com/photo-1542652694-40abf526446e?w=1200",
    )
    for s in ["viewpoint", "mountain", "offbeat", "150cc_plus"]:
        attach_tag(skandagiri, s)
    add_media(skandagiri, "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200", "Sunrise from the rock face")
    add_media(skandagiri, "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200", "Hairpins near the trailhead")

    savandurga = get_or_create_destination(
        "Savandurga",
        description=(
            "One of Asia's largest monolith hills, 60 km west of Bangalore on SH 17. "
            "Smooth road through scrub forest with a quick stop at the Veerabhadra temple at the base."
        ),
        region="Karnataka",
        country="India",
        currency="INR",
        latitude=12.9176,
        longitude=77.2965,
        terrain_difficulty=TerrainDifficulty.chill,
        estimated_food_cost=200,
        estimated_entry_cost=0,
        best_season="Year-round; avoid noon in summer",
        best_time_of_day="Sunrise or sunset",
        hero_media_url="https://images.unsplash.com/photo-1574263867128-c9cc34f3bb72?w=1200",
    )
    for s in ["mountain", "temple", "viewpoint", "any"]:
        attach_tag(savandurga, s)
    add_media(savandurga, "https://images.unsplash.com/photo-1588392382834-a891154bca4d?w=1200", "Monolith at first light")
    add_media(savandurga, "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1200", "Temple courtyard")

    coorg = get_or_create_destination(
        "Coorg",
        description=(
            "Coffee country between Madikeri and Kushalnagar. Twisty ghats from Mysore Road, "
            "plantation walks, filter coffee at every stop. ~265 km from Bangalore — best as a weekend trip."
        ),
        region="Karnataka",
        country="India",
        currency="INR",
        latitude=12.4244,
        longitude=75.7382,
        terrain_difficulty=TerrainDifficulty.moderate,
        estimated_food_cost=500,
        estimated_entry_cost=50,
        best_season="Oct–Mar",
        best_time_of_day="Start at dawn; reach by lunch",
        hero_media_url="https://images.unsplash.com/photo-1597306543490-3a31efcc4e1d?w=1200",
    )
    for s in ["mountain", "forest", "food-trail", "100cc_plus"]:
        attach_tag(coorg, s)
    add_media(coorg, "https://images.unsplash.com/photo-1568905730937-4e1d7bc8c72f?w=1200", "Abbey Falls in monsoon")
    add_media(coorg, "https://images.unsplash.com/photo-1580181566897-8cc5de1b0cd2?w=1200", "Filter coffee at a plantation stay")

    mekedatu = get_or_create_destination(
        "Mekedatu",
        description=(
            "Kaveri river squeezes through a deep granite gorge at Sangama. "
            "Coracle rides if water levels permit. ~90 km from Bangalore down Kanakapura Road."
        ),
        region="Karnataka",
        country="India",
        currency="INR",
        latitude=12.4083,
        longitude=77.4500,
        terrain_difficulty=TerrainDifficulty.moderate,
        estimated_food_cost=300,
        estimated_entry_cost=50,
        best_season="Jul–Feb",
        best_time_of_day="Morning",
        hero_media_url="https://images.unsplash.com/photo-1591824438708-ce405f36ba3d?w=1200",
    )
    for s in ["waterfall", "forest", "offbeat", "any"]:
        attach_tag(mekedatu, s)
    add_media(mekedatu, "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200", "Sangama river gorge")

    db.commit()
    print("  destinations: Skandagiri, Savandurga, Coorg, Mekedatu (idempotent)")

    # --------------------------------------------------------------------
    # 4. Rides
    # --------------------------------------------------------------------
    def make_ride(
        captain: User,
        dest: Destination,
        title: str,
        planned_date: date,
        time_str: str,
        status: RidePlanStatus,
        *,
        visibility: RidePlanVisibility = RidePlanVisibility.group,
        difficulty: DifficultyLevel = DifficultyLevel.moderate,
        max_riders: int = 8,
    ) -> RidePlan:
        existing = (
            db.query(RidePlan)
            .filter(RidePlan.title == title, RidePlan.captain_id == captain.id)
            .first()
        )
        if existing:
            return existing
        ride = RidePlan(
            destination_id=dest.id,
            captain_id=captain.id,
            title=title,
            thumbnail_url=dest.hero_media_url,
            planned_date=planned_date,
            planned_start_time=time.fromisoformat(time_str),
            visibility=visibility,
            difficulty_level=difficulty,
            max_riders=max_riders,
            status=status,
        )
        db.add(ride)
        db.flush()
        # Captain auto-joined as approved (matches M3 router behaviour)
        db.add(RidePlanParticipant(
            ride_plan_id=ride.id, user_id=captain.id, status=ParticipantStatus.approved,
        ))
        if visibility == RidePlanVisibility.group:
            db.add(ChatGroup(ride_plan_id=ride.id, name=ride.title))
        return ride

    def add_participant(ride: RidePlan, user: User, status=ParticipantStatus.approved) -> None:
        existing = (
            db.query(RidePlanParticipant)
            .filter(
                RidePlanParticipant.ride_plan_id == ride.id,
                RidePlanParticipant.user_id == user.id,
            )
            .first()
        )
        if existing:
            if existing.status != status:
                existing.status = status
            return
        db.add(RidePlanParticipant(
            ride_plan_id=ride.id, user_id=user.id, status=status,
        ))

    today = date.today()
    ride_skandagiri = make_ride(
        deb, skandagiri, "Skandagiri sunrise — pre-dawn run",
        today + timedelta(days=6), "03:30:00", RidePlanStatus.planned,
        difficulty=DifficultyLevel.moderate, max_riders=6,
    )
    add_participant(ride_skandagiri, sam)
    add_participant(ride_skandagiri, jordan)
    add_participant(ride_skandagiri, casey, ParticipantStatus.pending)

    ride_savandurga = make_ride(
        sam, savandurga, "Savandurga monolith chill ride",
        today, "06:00:00", RidePlanStatus.in_progress,
        difficulty=DifficultyLevel.easy,
    )
    add_participant(ride_savandurga, deb)
    add_participant(ride_savandurga, jordan)

    ride_coorg = make_ride(
        alex, coorg, "Coorg coffee weekend (3 days)",
        today - timedelta(days=14), "05:00:00", RidePlanStatus.completed,
        difficulty=DifficultyLevel.moderate, max_riders=10,
    )
    add_participant(ride_coorg, deb)
    add_participant(ride_coorg, sam)
    add_participant(ride_coorg, casey)

    ride_mekedatu = make_ride(
        jordan, mekedatu, "Mekedatu monsoon run",
        today + timedelta(days=20), "06:30:00", RidePlanStatus.planned,
        difficulty=DifficultyLevel.moderate,
    )
    add_participant(ride_mekedatu, deb)
    add_participant(ride_mekedatu, alex)

    db.commit()
    print("  rides: 4 (1 captained by deb, 3 joined)")

    # --------------------------------------------------------------------
    # 5. Hinglish chat messages
    # --------------------------------------------------------------------
    def chat_msgs(
        ride: RidePlan, messages: list[tuple[User, str]], base_ts: datetime,
    ) -> None:
        group = (
            db.query(ChatGroup).filter(ChatGroup.ride_plan_id == ride.id).first()
        )
        if not group:
            return
        existing_count = (
            db.query(ChatMessage).filter(ChatMessage.chat_group_id == group.id).count()
        )
        if existing_count > 0:
            print(f"    skip seed messages for {ride.title} ({existing_count} already present)")
            return
        for i, (author, body) in enumerate(messages):
            db.add(ChatMessage(
                chat_group_id=group.id,
                author_id=author.id,
                body=body,
                created_at=base_ts + timedelta(minutes=i * 7),
            ))

    now = datetime.now(timezone.utc)

    # Skandagiri (planned, 6 days out — chat from a few days ago, building hype)
    chat_msgs(ride_skandagiri, [
        (deb, "Bhai weekend ka plan pakka! Sunday 3:30am, Skandagiri pe milte hain"),
        (sam, "Yaar 3:30 itni jaldi? 😩 Helmet visor dark hai meri"),
        (deb, "Sunrise pakadna hai bro, traffic se bhi bach jayenge"),
        (jordan, "Petrol full karwa lena, BLR-Skandagiri-BLR ~120 km hai"),
        (sam, "Coffee stop on the way? Devanahalli mein ek dhaba accha hai"),
        (deb, "Pakka, Devanahalli pe 4am. Don't be late guys"),
        (jordan, "Tyre pressure check kar lo sab, ghat road hai upar"),
        (deb, "Group photo zaroor lenge top pe 📸"),
        (sam, "Casey ne abhi tak confirm nahi kiya, tum follow karo deb"),
        (deb, "Casey bro? Aa raha hai na?"),
    ], base_ts=now - timedelta(days=2))

    # Savandurga (in_progress, happening today)
    chat_msgs(ride_savandurga, [
        (sam, "Pohunch gaya guys, parking near temple"),
        (deb, "5 min more, Magadi road clear hai"),
        (jordan, "Maine breakfast kar liya, idli vada in Magadi"),
        (sam, "Sab aa jao, top pe hike short hai"),
        (deb, "Bro temple darshan karke chalte hain"),
        (sam, "Pakka. Views are insane today, mist clear ho gaya hai"),
        (jordan, "Itne rocks hain ki shoe grip chahiye"),
        (deb, "Helmets utar lo upar, sun strong hai"),
    ], base_ts=now - timedelta(hours=3))

    # Coorg (completed 14 days ago — chat from ride week)
    chat_msgs(ride_coorg, [
        (alex, "Friday 5am sharp, Mysore Road. Tank full please"),
        (deb, "Tank full, snacks pack ho gaya. Beena cigarette wagaira"),
        (sam, "Coorg pohunch ke pehle Bylakuppe ka golden temple dekhenge"),
        (casey, "Plantation stay book ho gaya, 3 rooms confirmed"),
        (alex, "Saturday subah Abbey Falls + Talakaveri"),
        (deb, "Filter coffee at every stop please 😂"),
        (sam, "Riders, helmets on. Ghat starts after Kushalnagar"),
        (casey, "Sunday 4pm tak nikalte hain warna Sunday traffic dead"),
        (alex, "Best ride of the year so far, photos uploading"),
        (deb, "Next time Wayanad? Karnataka-Kerala border via Sultan Bathery"),
        (sam, "Pakka. Monsoon ke baad."),
    ], base_ts=now - timedelta(days=16))

    # Mekedatu (planned 20 days out — early chat)
    chat_msgs(ride_mekedatu, [
        (jordan, "Monsoon mein Kaveri ka water level peak hota hai, perfect time"),
        (deb, "Coracle ride milegi? Last time water zyada tha"),
        (alex, "Sangama tak ride, baaki paidal"),
        (jordan, "Raincoat mat bhulna, Kanakapura ke baad weather change hota hai"),
        (deb, "Pakka. 6:30am Banashankari pe milte hain"),
        (alex, "Dhaba breakfast at Kanakapura — Kamat ka spot"),
    ], base_ts=now - timedelta(days=1))

    db.commit()
    print("  chat messages: ~37 across 4 groups")

    # --------------------------------------------------------------------
    # 6. Follow graph
    # --------------------------------------------------------------------
    def follow(follower: User, followed: User) -> None:
        exists = (
            db.query(Follow)
            .filter(Follow.follower_id == follower.id, Follow.followed_id == followed.id)
            .first()
        )
        if exists:
            return
        db.add(Follow(follower_id=follower.id, followed_id=followed.id))

    follow(deb, alex)
    follow(deb, sam)
    follow(deb, jordan)
    follow(alex, deb)
    follow(sam, deb)
    follow(jordan, deb)
    follow(casey, deb)

    db.commit()
    print("  follow graph: deb ↔ alex/sam/jordan + casey → deb")

    # --------------------------------------------------------------------
    # 7. Completed Coorg ride log + media + rating
    # --------------------------------------------------------------------
    existing_log = (
        db.query(RideLog)
        .filter(RideLog.ride_plan_id == ride_coorg.id, RideLog.rider_id == deb.id)
        .first()
    )
    if not existing_log:
        coorg_day = today - timedelta(days=14)
        log = RideLog(
            ride_plan_id=ride_coorg.id,
            rider_id=deb.id,
            actual_start_ts=datetime.combine(coorg_day, time(5, 30), tzinfo=timezone.utc),
            actual_end_ts=datetime.combine(coorg_day + timedelta(days=2), time(20, 0), tzinfo=timezone.utc),
            actual_cost=2400,
            road_condition=RoadCondition.good,
            recommended=True,
            notes=(
                "Coffee + ghats + good company. Bylakuppe golden temple was unreal at golden hour. "
                "Saturday Abbey Falls had decent flow. Will go back next monsoon."
            ),
        )
        db.add(log)
        db.flush()

        media_urls = [
            ("https://images.unsplash.com/photo-1568905730937-4e1d7bc8c72f?w=1200", "Abbey Falls in monsoon"),
            ("https://images.unsplash.com/photo-1580181566897-8cc5de1b0cd2?w=1200", "Filter coffee at our plantation stay"),
            ("https://images.unsplash.com/photo-1597306543490-3a31efcc4e1d?w=1200", "Bylakuppe Golden Temple"),
        ]
        for url, caption in media_urls:
            db.add(RideMedia(
                ride_log_id=log.id, url=url, media_type=MediaType.image,
                uploaded_by_user_id=deb.id, caption=caption,
            ))
            # Flywheel — same photos appear on the destination page
            db.add(DestinationMedia(
                destination_id=coorg.id, url=url, caption=caption,
                uploaded_by_user_id=deb.id, ride_log_id=log.id,
            ))
        print(f"  ride log on Coorg + 3 media (linked to destination)")

        # Rating on Coorg
        existing_rating = (
            db.query(Rating)
            .filter(Rating.destination_id == coorg.id, Rating.user_id == deb.id)
            .first()
        )
        if not existing_rating:
            db.add(Rating(
                destination_id=coorg.id, user_id=deb.id, stars=5,
                review="Best Karnataka weekend. Coffee, ghats, good company. Repeat next monsoon.",
                ride_log_id=log.id,
            ))
            db.flush()
            # Recompute aggregates (matches the M2 atomic-upsert pattern)
            avg = (
                db.query(func.avg(Rating.stars))
                .filter(Rating.destination_id == coorg.id)
                .scalar()
            )
            count = (
                db.query(func.count(Rating.id))
                .filter(Rating.destination_id == coorg.id)
                .scalar()
            )
            coorg.avg_rating = float(avg or 0.0)
            coorg.rating_count = int(count or 0)
            print(f"  rating: 5★ on Coorg (avg now {coorg.avg_rating})")

    db.commit()

    # --------------------------------------------------------------------
    # 8. Summary
    # --------------------------------------------------------------------
    captained = db.query(RidePlan).filter(RidePlan.captain_id == deb.id).count()
    joined = (
        db.query(RidePlanParticipant)
        .filter(
            RidePlanParticipant.user_id == deb.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .count()
    )
    followers = db.query(Follow).filter(Follow.followed_id == deb.id).count()
    following = db.query(Follow).filter(Follow.follower_id == deb.id).count()

    print("\n✓ Seed complete")
    print(f"  deb rides_captained:  {captained}")
    print(f"  deb rides_joined:     {joined} (approved participations, includes the auto-self-join for captained)")
    print(f"  deb followers:        {followers}")
    print(f"  deb following:        {following}")


if __name__ == "__main__":
    main()
