"""Seed script — populates the demo dataset for the M1 schema.

Idempotent: skips if any User already exists.
Run via: python -m app.seed  (from backend/)
"""
from __future__ import annotations

from app.database import SessionLocal
from app.models.badge import Badge
from app.models.destination import (
    Destination,
    DestinationMedia,
    DestinationTag,
    Tag,
    TagCategory,
    TerrainDifficulty,
)
from app.models.ride import Bike, BikeType
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Static catalogs
# ---------------------------------------------------------------------------
TAGS = [
    # Vibe
    ("waterfall", "Waterfall", TagCategory.vibe),
    ("mountain", "Mountain", TagCategory.vibe),
    ("coastal", "Coastal", TagCategory.vibe),
    ("temple", "Temple", TagCategory.vibe),
    ("food-trail", "Food Trail", TagCategory.vibe),
    ("offbeat", "Offbeat", TagCategory.vibe),
    ("viewpoint", "Viewpoint", TagCategory.vibe),
    ("fort", "Fort", TagCategory.vibe),
    ("beach", "Beach", TagCategory.vibe),
    ("forest", "Forest", TagCategory.vibe),
    # Vehicle fit
    ("any", "Any", TagCategory.vehicle_fit),
    ("100cc_plus", "100cc+", TagCategory.vehicle_fit),
    ("150cc_plus", "150cc+", TagCategory.vehicle_fit),
    ("adventure", "Adventure Bike", TagCategory.vehicle_fit),
    ("4x4_only", "4x4 Only", TagCategory.vehicle_fit),
]


BADGES = [
    ("first_ride", "First Ride", "Complete your first ride log"),
    ("dawn_patrol", "Dawn Patrol", "Start a ride before 7:00 AM"),
    ("century_club", "Century Club", "Complete a ride of 100 km or more"),
    ("destination_collector", "Destination Collector", "Visit 5 unique destinations"),
    ("storyteller", "Storyteller", "Upload 10 photos across rides"),
    ("early_adopter", "Early Adopter", "Joined Rydr during Phase 3 launch"),
]


USERS = [
    {
        "name": "Alex Rider",
        "email": "alex@ryder.com",
        "phone": "+91 98765 40001",
        "bio": "Weekend warrior with 6 years on two wheels. Love ghat roads, waterfalls, and chasing sunrises.",
        "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Shadow", "model": "Honda CB650R", "year": 2023,
            "engine_cc": 649, "mileage_kmpl": 21.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Sam Cruz",
        "email": "sam@ryder.com",
        "phone": "+91 98765 40002",
        "bio": "Adventure rider and off-road junkie. 8 years of riding, 40k+ km logged.",
        "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Desert Fox", "model": "BMW R1250GS Adventure", "year": 2022,
            "engine_cc": 1254, "mileage_kmpl": 18.0, "type": BikeType.adventure,
        },
    },
    {
        "name": "Jordan Miles",
        "email": "jordan@ryder.com",
        "phone": "+91 98765 40003",
        "bio": "Cruiser enthusiast and sunset chaser. 4 years riding, mostly coastal routes.",
        "avatar_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Thunderbird", "model": "Royal Enfield Classic 350", "year": 2024,
            "engine_cc": 349, "mileage_kmpl": 35.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Casey Storm",
        "email": "casey@ryder.com",
        "phone": "+91 98765 40004",
        "bio": "Track day regular turned touring rider. 10 years in the saddle.",
        "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Bolt", "model": "Kawasaki Z900", "year": 2023,
            "engine_cc": 948, "mileage_kmpl": 17.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Riley Vance",
        "email": "riley@ryder.com",
        "phone": "+91 98765 40005",
        "bio": "Night rider and city explorer. 3 years on a naked bike, mostly urban routes.",
        "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Phantom", "model": "Yamaha MT-07", "year": 2024,
            "engine_cc": 689, "mileage_kmpl": 25.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Morgan Blake",
        "email": "morgan@ryder.com",
        "phone": "+91 98765 40006",
        "bio": "Dual-sport addict. 5 years splitting time between fire roads and highways.",
        "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face",
        "bike": {
            "name": "Nomad", "model": "KTM 390 Adventure", "year": 2023,
            "engine_cc": 373, "mileage_kmpl": 30.0, "type": BikeType.adventure,
        },
    },
]


DESTINATIONS = [
    {
        "name": "Nandi Hills",
        "description": (
            "Classic weekend sunrise ride near Bangalore. 60km of rolling plains "
            "then a 6km hill climb with sharp hairpins. Best in the cool early "
            "morning mist before the crowd arrives."
        ),
        "region": "Karnataka",
        "latitude": 13.3702,
        "longitude": 77.6835,
        "terrain_difficulty": TerrainDifficulty.moderate,
        "estimated_food_cost": 300,
        "estimated_entry_cost": 50,
        "best_season": "Year-round, peak Oct-Feb",
        "best_time_of_day": "Pre-dawn for sunrise",
        "hero_media_url": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800",
        "tag_slugs": ["viewpoint", "mountain", "offbeat", "any"],
        "gallery": [
            "https://images.unsplash.com/photo-1588392382834-a891154bca4d?w=800",
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        ],
    },
    {
        "name": "Tirthan Valley",
        "description": (
            "Hidden gem in Himachal — trout streams, wooden cottages, pine forests. "
            "Road quality deteriorates after Banjar, but the payoff is unreal."
        ),
        "region": "Himachal Pradesh",
        "latitude": 31.6200,
        "longitude": 77.4200,
        "terrain_difficulty": TerrainDifficulty.rough,
        "estimated_food_cost": 600,
        "estimated_entry_cost": 0,
        "best_season": "Apr-Jun, Sep-Nov",
        "best_time_of_day": "Start in the morning, reach by evening",
        "hero_media_url": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        "tag_slugs": ["mountain", "forest", "offbeat", "150cc_plus", "adventure"],
        "gallery": [
            "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800",
            "https://images.unsplash.com/photo-1516542076529-1ea3854896f2?w=800",
        ],
    },
    {
        "name": "Gokarna",
        "description": (
            "Temple town meets beach paradise. Coastal NH-66 ride, ending at quieter "
            "beaches than Goa. Om Beach and Kudle Beach are within walking distance."
        ),
        "region": "Karnataka",
        "latitude": 14.5479,
        "longitude": 74.3188,
        "terrain_difficulty": TerrainDifficulty.moderate,
        "estimated_food_cost": 500,
        "estimated_entry_cost": 0,
        "best_season": "Oct-Mar",
        "best_time_of_day": "Start at dawn to beat the coastal heat",
        "hero_media_url": "https://images.unsplash.com/photo-1583405371897-e3a2b43d5b30?w=800",
        "tag_slugs": ["beach", "coastal", "temple", "any"],
        "gallery": [
            "https://images.unsplash.com/photo-1566138884777-e9e3efb4da9a?w=800",
            "https://images.unsplash.com/photo-1572883454114-1cf0031ede2a?w=800",
        ],
    },
    {
        "name": "Chikmagalur",
        "description": (
            "Coffee country hill station. Winding ghat roads through plantation "
            "shade, peaks of the Bababudangiri range, and filter coffee at every "
            "stop."
        ),
        "region": "Karnataka",
        "latitude": 13.3161,
        "longitude": 75.7720,
        "terrain_difficulty": TerrainDifficulty.moderate,
        "estimated_food_cost": 400,
        "estimated_entry_cost": 50,
        "best_season": "Sep-Mar",
        "best_time_of_day": "Any; fog is common in mornings",
        "hero_media_url": "https://images.unsplash.com/photo-1580181566897-8cc5de1b0cd2?w=800",
        "tag_slugs": ["mountain", "forest", "food-trail", "100cc_plus"],
        "gallery": [
            "https://images.unsplash.com/photo-1574263867128-c9cc34f3bb72?w=800",
            "https://images.unsplash.com/photo-1568905730937-4e1d7bc8c72f?w=800",
        ],
    },
    {
        "name": "Lansdowne",
        "description": (
            "Quiet Uttarakhand hill station with none of the tourist crowds. Pine "
            "forests, colonial architecture, and sweeping views of the Himalayan "
            "range on clear days."
        ),
        "region": "Uttarakhand",
        "latitude": 29.8378,
        "longitude": 78.6867,
        "terrain_difficulty": TerrainDifficulty.rough,
        "estimated_food_cost": 400,
        "estimated_entry_cost": 0,
        "best_season": "Mar-Jun, Sep-Nov",
        "best_time_of_day": "Start early from Delhi (5am) to beat traffic",
        "hero_media_url": "https://images.unsplash.com/photo-1598881034666-0b8ae1b6b0b7?w=800",
        "tag_slugs": ["mountain", "forest", "offbeat", "150cc_plus"],
        "gallery": [
            "https://images.unsplash.com/photo-1578308093717-4fc7d6c3d8e7?w=800",
            "https://images.unsplash.com/photo-1598881034623-f4a3e86b9cc5?w=800",
        ],
    },
]


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).first():
            print("Database already seeded, skipping.")
            return

        # Tags
        tag_map: dict[str, Tag] = {}
        for slug, label, category in TAGS:
            tag = Tag(slug=slug, label=label, category=category)
            db.add(tag)
            db.flush()
            tag_map[slug] = tag
        print(f"Seeded {len(TAGS)} tags")

        # Badges
        for slug, name, description in BADGES:
            db.add(Badge(slug=slug, name=name, description=description))
        print(f"Seeded {len(BADGES)} badges")

        # Users + bikes
        for ud in USERS:
            user = User(
                name=ud["name"],
                email=ud["email"],
                phone=ud["phone"],
                bio=ud["bio"],
                avatar_url=ud["avatar_url"],
                password_hash=hash_password("password123"),
            )
            db.add(user)
            db.flush()

            bd = ud["bike"]
            db.add(
                Bike(
                    user_id=user.id,
                    name=bd["name"],
                    model=bd["model"],
                    year=bd["year"],
                    engine_cc=bd["engine_cc"],
                    mileage_kmpl=bd["mileage_kmpl"],
                    type=bd["type"],
                )
            )
        print(f"Seeded {len(USERS)} users + bikes")

        # Destinations + tags + gallery
        for dd in DESTINATIONS:
            dest = Destination(
                name=dd["name"],
                description=dd["description"],
                region=dd["region"],
                country="India",
                currency="INR",
                latitude=dd["latitude"],
                longitude=dd["longitude"],
                terrain_difficulty=dd["terrain_difficulty"],
                estimated_food_cost=dd["estimated_food_cost"],
                estimated_entry_cost=dd["estimated_entry_cost"],
                best_season=dd["best_season"],
                best_time_of_day=dd["best_time_of_day"],
                hero_media_url=dd["hero_media_url"],
            )
            db.add(dest)
            db.flush()

            for slug in dd["tag_slugs"]:
                tag = tag_map.get(slug)
                if tag is None:
                    raise RuntimeError(f"Seed references unknown tag slug: {slug}")
                db.add(DestinationTag(destination_id=dest.id, tag_id=tag.id))

            for url in dd["gallery"]:
                db.add(DestinationMedia(destination_id=dest.id, url=url))
        print(f"Seeded {len(DESTINATIONS)} destinations with tags + gallery")

        db.commit()
        print("Seed complete.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
