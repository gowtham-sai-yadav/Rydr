"""Seed script - populates the demo dataset for the M1 schema, plus a
realistic user base, a broad destination library, and social feed activity.

Idempotent: skips if any User already exists.
Run via: python -m app.seed  (from backend/)

Images: user avatars and ride-log photos use Picsum's deterministic seeded
endpoint (``https://picsum.photos/seed/<seed>/<w>/<h>``), which always
resolves but returns an arbitrary photo - fine when the subject doesn't
matter. Destination photos are different: showing a desert dune for a misty
Western Ghats hill station is worse than a placeholder, so those use
``https://picsum.photos/id/<id>/<w>/<h>`` with specific photo ids that were
downloaded and visually checked against each destination's terrain (see
TERRAIN_IMAGES / DESTINATION_TERRAIN below) - mountain hill-stations get
green ridgelines, coastal rides get shoreline, the one high-altitude cold
desert (Spiti) gets snow-capped peaks, and so on.
"""
from __future__ import annotations

import random
import re
from datetime import date, datetime, time, timedelta, timezone

from app.database import SessionLocal
from app.models.badge import Badge, BadgeRarity
from app.models.destination import (
    Destination,
    DestinationMedia,
    DestinationTag,
    Tag,
    TagCategory,
    TerrainDifficulty,
)
from app.models.post import Post, PostComment, PostLike
from app.models.social import Follow
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
from app.models.chat import ChatGroup, ChatMessage
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Image helper
# ---------------------------------------------------------------------------
def picsum(seed: str, w: int = 800, h: int = 500) -> str:
    """Deterministic, always-resolving image URL for a given seed string.
    The photo itself is arbitrary - only used where subject matter doesn't
    matter (user avatars, ride-log snapshots)."""
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


def picsum_id(photo_id: int, w: int = 800, h: int = 500) -> str:
    """A specific, visually-verified Picsum photo, for places where the
    subject matter has to actually match (destination hero/gallery)."""
    return f"https://picsum.photos/id/{photo_id}/{w}/{h}"


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ---------------------------------------------------------------------------
# Destination imagery - terrain-matched, not random
# ---------------------------------------------------------------------------
# Each list holds Picsum photo ids that were downloaded and visually
# confirmed to show that terrain. Multiple ids per bucket give variety
# across destinations that share a bucket.
TERRAIN_IMAGES: dict[str, list[int]] = {
    "mountain": [66, 116, 177, 731],      # green ridgelines / hill-station valleys
    "waterfall": [15, 28],                 # rock-strewn waterfall gorges
    "coastal": [37, 74, 275, 338, 588],    # shoreline, cliffs, pier
    "forest": [190, 10, 28],               # tree canopy / forest path
    "lake": [469],                         # still water, reflection
    "desert": [184],                       # Thar-style sand dunes at dusk
    "fort": [546],                         # stone archways / heritage interior
    "snow": [29, 572],                     # snow-capped high-altitude peaks
    "viewpoint": [388, 705],               # sunrise/sunset scenic, generic fallback
}

# Explicit per-destination bucket, set by hand against each entry's actual
# terrain/description below - not inferred from tags, since a spot tagged
# both "mountain" and "waterfall" still needs one clear photo to pick.
DESTINATION_TERRAIN: dict[str, str] = {
    "Nandi Hills": "viewpoint",
    "Skandagiri": "viewpoint",
    "Savandurga": "mountain",
    "Muthyala Maduvu": "waterfall",
    "Ramanagara": "mountain",
    "Devarayanadurga": "forest",
    "Bannerghatta": "forest",
    "Antaragange": "mountain",
    "Sangama": "forest",
    "Gokarna": "coastal",
    "Chikmagalur": "mountain",
    "Lonavala": "waterfall",
    "Mahabaleshwar": "mountain",
    "Malshej Ghat": "waterfall",
    "Matheran": "forest",
    "Igatpuri": "waterfall",
    "Yelagiri": "mountain",
    "Yercaud": "mountain",
    "Ooty": "mountain",
    "Kodaikanal": "mountain",
    "Pondicherry via ECR": "coastal",
    "Ananthagiri Hills": "waterfall",
    "Pakhal Lake": "lake",
    "Warangal Fort": "fort",
    "Nagarjuna Sagar": "lake",
    "Lansdowne": "forest",
    "Nahan": "mountain",
    "Chakrata": "waterfall",
    "Kasauli": "mountain",
    "Sariska": "forest",
    "Mandarmani": "coastal",
    "Digha": "coastal",
    "Pushkar": "desert",
    "Jaisalmer": "desert",
    "Udaipur": "lake",
    "Munnar": "mountain",
    "Wayanad": "waterfall",
    "Vagamon": "mountain",
    "Goa Coastal Loop": "coastal",
    "Tirthan Valley": "forest",
    "Spiti Valley": "snow",
    "Mussoorie": "mountain",
    "Nainital": "lake",
}


# Real photo of the actual named place for every destination - one Wikimedia
# Commons/Wikipedia photo per entry, looked up per-destination and visually
# checked (not a generic "mountain"/"beach" stock photo). Every URL here is
# unique, so no two destinations share a hero image.
DESTINATION_PHOTOS: dict[str, str] = {
    "Ananthagiri Hills": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Ananthagiri_Hills.JPG/960px-Ananthagiri_Hills.JPG",
    "Antaragange": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Antharagange.JPG/960px-Antharagange.JPG",
    "Bannerghatta": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Lurking_tiger.jpg/960px-Lurking_tiger.jpg",
    "Chakrata": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Chakrata_small.JPG/960px-Chakrata_small.JPG",
    "Chikmagalur": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Chikmagalur%2C_India._%287793316622%29.jpg/960px-Chikmagalur%2C_India._%287793316622%29.jpg",
    "Devarayanadurga": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Yoga_Narasimha_Temple_Devarayanadurga.JPG/960px-Yoga_Narasimha_Temple_Devarayanadurga.JPG",
    "Digha": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Digha_Tourist_Lodge_front_yard_1.jpg/960px-Digha_Tourist_Lodge_front_yard_1.jpg",
    "Goa Coastal Loop": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/BeachFun.jpg/960px-BeachFun.jpg",
    "Gokarna": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Delight_india.jpg",
    "Igatpuri": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Igatpuri_waterfall.jpg/960px-Igatpuri_waterfall.jpg",
    "Jaisalmer": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Jaisalmer_Fort.jpg/960px-Jaisalmer_Fort.jpg",
    "Kasauli": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Kasauli_hills.jpg/960px-Kasauli_hills.jpg",
    "Kodaikanal": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Boating_in_Kodaikanal_Lake_with_Mist.jpg/960px-Boating_in_Kodaikanal_Lake_with_Mist.jpg",
    "Lansdowne": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Lansdowne_Landscape.jpg/960px-Lansdowne_Landscape.jpg",
    "Lonavala": "https://upload.wikimedia.org/wikipedia/commons/5/5d/Mumbai_Pune_Expressway2.jpg",
    "Mahabaleshwar": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/MAHABALESWAR_LANDSCAPE.jpg/960px-MAHABALESWAR_LANDSCAPE.jpg",
    "Malshej Ghat": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Malshej_Hills.jpg/960px-Malshej_Hills.jpg",
    "Mandarmani": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Mandarmani_Sea_Beach.jpg/960px-Mandarmani_Sea_Beach.jpg",
    "Matheran": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Matheran_In_Clouds.jpg/960px-Matheran_In_Clouds.jpg",
    "Munnar": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Munnar_Overview.jpg/960px-Munnar_Overview.jpg",
    "Mussoorie": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Mussoorie_Snow_Over_Dehradun_%2814831297545%29.jpg/960px-Mussoorie_Snow_Over_Dehradun_%2814831297545%29.jpg",
    "Muthyala Maduvu": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Muthyalamaduvu2.jpg/960px-Muthyalamaduvu2.jpg",
    "Nagarjuna Sagar": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/NagarjunaSagarDam.JPG/960px-NagarjunaSagarDam.JPG",
    "Nahan": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Banethi_forest_rest_house_%2CSirmaur_%2CNahan_%2CHimachal_Pardesh_01.jpg/960px-Banethi_forest_rest_house_%2CSirmaur_%2CNahan_%2CHimachal_Pardesh_01.jpg",
    "Nainital": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Nainital_metro.jpg/960px-Nainital_metro.jpg",
    "Nandi Hills": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Sun_rising_over_a_blanket_of_clouds%2C_Nandi_Hills%2C_Karnataka_%28edit%29.jpg/960px-Sun_rising_over_a_blanket_of_clouds%2C_Nandi_Hills%2C_Karnataka_%28edit%29.jpg",
    "Ooty": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Ooty_lake.jpg/960px-Ooty_lake.jpg",
    "Pakhal Lake": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Pakhal_Lake_Telangana.jpg/960px-Pakhal_Lake_Telangana.jpg",
    "Pondicherry via ECR": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/View_of_Rock_Beach_%28Puducherry_Beach%29_3.jpg/960px-View_of_Rock_Beach_%28Puducherry_Beach%29_3.jpg",
    "Pushkar": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Pushkar.jpg/960px-Pushkar.jpg",
    "Ramanagara": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Ramanagara_.jpg/960px-Ramanagara_.jpg",
    "Sangama": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Cauvery_Kaveri_River_Karnataka_India.jpg/960px-Cauvery_Kaveri_River_Karnataka_India.jpg",
    "Sariska": "https://upload.wikimedia.org/wikipedia/commons/e/e5/Sariska_Tiger_Reserve%2C_Alwar.jpg",
    "Savandurga": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Savandurga_Hill_02.jpg/960px-Savandurga_Hill_02.jpg",
    "Skandagiri": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Skandagiri.jpg/960px-Skandagiri.jpg",
    "Spiti Valley": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Spiti_River_Kaza_Himachal_Jun18_D72_7232.jpg/960px-Spiti_River_Kaza_Himachal_Jun18_D72_7232.jpg",
    "Tirthan Valley": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Tirthan_River_Tirthan_Valley_DSC00968.jpg/960px-Tirthan_River_Tirthan_Valley_DSC00968.jpg",
    "Udaipur": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Evening_view%2C_City_Palace%2C_Udaipur.jpg/960px-Evening_view%2C_City_Palace%2C_Udaipur.jpg",
    "Vagamon": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Vagamon_meadows.JPG/960px-Vagamon_meadows.JPG",
    "Warangal Fort": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Shiv_Linga_at_Warangal_Fort_Complex.jpg/960px-Shiv_Linga_at_Warangal_Fort_Complex.jpg",
    "Wayanad": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Blue%2C_Green_%26_White.jpg/960px-Blue%2C_Green_%26_White.jpg",
    "Yelagiri": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/01Yelagiri_Hills.jpg/960px-01Yelagiri_Hills.jpg",
    "Yercaud": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Yercaud_lake.jpg/960px-Yercaud_lake.jpg",
}


def _destination_images(name: str) -> tuple[str, list[str]]:
    """Returns (hero_url, gallery_urls) for a destination. Hero is the real,
    verified photo of that specific place from DESTINATION_PHOTOS. Gallery
    fills in from the destination's terrain bucket (Picsum ids), rotated by
    name so no two destinations show the identical gallery pair - the hero
    is what carries the "is this actually the place" signal, the gallery
    just needs to feel like more of the same terrain."""
    hero = DESTINATION_PHOTOS[name]
    bucket = DESTINATION_TERRAIN.get(name, "viewpoint")
    ids = TERRAIN_IMAGES[bucket]
    start = sum(ord(c) for c in name) % len(ids)
    gallery = [
        picsum_id(ids[start]),
        picsum_id(ids[(start + 1) % len(ids)]),
    ]
    return hero, gallery


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


# (slug, name, description, rarity) - slug must match a key in
# badge_engine.BADGE_PREDICATES or the badge can never actually be earned
# (this catalog and that predicate table previously drifted independently
# and had zero overlapping slugs - nothing was awardable. Fixed here.)
BADGES = [
    ("first-ride", "First Ride", "Complete your first ride log", "common"),
    ("dawn-patrol", "Dawn Patrol", "Start a ride before 7:00 AM", "common"),
    ("rider-bronze", "Rider Bronze", "Complete 3 rides", "common"),
    ("captain-bronze", "Captain Bronze", "Captain your first ride", "common"),
    ("joiner-bronze", "Joiner Bronze", "Get approved on 3 rides you didn't captain", "common"),
    ("rider-silver", "Rider Silver", "Complete 6 rides", "rare"),
    ("captain-silver", "Captain Silver", "Captain 5 rides", "rare"),
    ("century-club", "Century Club", "Complete a single ride of 100 km or more", "rare"),
    ("storyteller", "Storyteller", "Upload 10 photos across your rides", "rare"),
    ("destination-collector", "Destination Collector", "Visit 5 unique destinations", "rare"),
    ("rider-gold", "Rider Gold", "Complete 10 rides", "epic"),
    ("star-rider", "Star Rider", "Complete 3+ rides and leave a 5-star rating", "epic"),
    ("double-trouble", "Double Trouble", "Log two separate rides in one day", "epic"),
    ("distance-1000", "1000 Club", "Ride 1,000 km lifetime", "epic"),
    ("consistency-6", "Half-Year Streak", "Ride at least once a month for 6 months straight", "legendary"),
    ("consistency-12", "Iron Year", "Ride at least once a month for 12 months straight", "legendary"),
]


# ---------------------------------------------------------------------------
# Users - 24 riders spread across major Indian cities
# ---------------------------------------------------------------------------
USERS = [
    {
        "name": "Alex Rider",
        "email": "alex@ryder.com",
        "phone": "+91 98765 40001",
        "bio": "Weekend warrior with 6 years on two wheels. Love ghat roads, waterfalls, and chasing sunrises.",
        "home_city": "Bangalore", "home_latitude": 12.9716, "home_longitude": 77.5946,
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
        "home_city": "Pune", "home_latitude": 18.5204, "home_longitude": 73.8567,
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
        "home_city": "Chennai", "home_latitude": 13.0827, "home_longitude": 80.2707,
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
        "home_city": "Mumbai", "home_latitude": 19.0760, "home_longitude": 72.8777,
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
        "home_city": "Delhi", "home_latitude": 28.7041, "home_longitude": 77.1025,
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
        "home_city": "Hyderabad", "home_latitude": 17.3850, "home_longitude": 78.4867,
        "bike": {
            "name": "Nomad", "model": "KTM 390 Adventure", "year": 2023,
            "engine_cc": 373, "mileage_kmpl": 30.0, "type": BikeType.adventure,
        },
    },
    {
        "name": "Arjun Rao",
        "email": "arjun@ryder.com",
        "phone": "+91 98765 40007",
        "bio": "Royal Enfield lifer. Ghat roads on weekends, coffee-estate detours whenever possible.",
        "home_city": "Bangalore", "home_latitude": 12.9716, "home_longitude": 77.5946,
        "bike": {
            "name": "Bullet", "model": "Royal Enfield Himalayan", "year": 2023,
            "engine_cc": 411, "mileage_kmpl": 28.0, "type": BikeType.adventure,
        },
    },
    {
        "name": "Priya Nair",
        "email": "priya@ryder.com",
        "phone": "+91 98765 40008",
        "bio": "Started riding two years ago and never looked back. Backwaters and hill stations over highways.",
        "home_city": "Kochi", "home_latitude": 9.9312, "home_longitude": 76.2673,
        "bike": {
            "name": "Breeze", "model": "TVS Apache RTR 200 4V", "year": 2022,
            "engine_cc": 197, "mileage_kmpl": 38.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Vikram Singh",
        "email": "vikram@ryder.com",
        "phone": "+91 98765 40009",
        "bio": "Long-distance tourer. Delhi to Ladakh twice, planning the third run this season.",
        "home_city": "Delhi", "home_latitude": 28.7041, "home_longitude": 77.1025,
        "bike": {
            "name": "Rover", "model": "Royal Enfield Meteor 350", "year": 2023,
            "engine_cc": 349, "mileage_kmpl": 33.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Ananya Iyer",
        "email": "ananya@ryder.com",
        "phone": "+91 98765 40010",
        "bio": "Weekend rider chasing waterfalls around the Western Ghats. New to touring, hooked already.",
        "home_city": "Pune", "home_latitude": 18.5204, "home_longitude": 73.8567,
        "bike": {
            "name": "Ember", "model": "Yamaha R15 V4", "year": 2024,
            "engine_cc": 155, "mileage_kmpl": 40.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Rahul Verma",
        "email": "rahul@ryder.com",
        "phone": "+91 98765 40011",
        "bio": "Commuter by week, tourer by weekend. Fort rides and food-trail detours are my thing.",
        "home_city": "Jaipur", "home_latitude": 26.9124, "home_longitude": 75.7873,
        "bike": {
            "name": "Dust Devil", "model": "Bajaj Dominar 400", "year": 2022,
            "engine_cc": 373, "mileage_kmpl": 27.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Neha Kapoor",
        "email": "neha@ryder.com",
        "phone": "+91 98765 40012",
        "bio": "Solo female rider, big on safety gear and even bigger on sunrise starts.",
        "home_city": "Chandigarh", "home_latitude": 30.7333, "home_longitude": 76.7794,
        "bike": {
            "name": "Highline", "model": "KTM 390 Duke", "year": 2023,
            "engine_cc": 373, "mileage_kmpl": 26.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Karan Mehta",
        "email": "karan@ryder.com",
        "phone": "+91 98765 40013",
        "bio": "Off-road first, tarmac second. Weekends mean mud, dust, and a Xpulse that's seen worse.",
        "home_city": "Ahmedabad", "home_latitude": 23.0225, "home_longitude": 72.5714,
        "bike": {
            "name": "Trailblazer", "model": "Hero Xpulse 200 4V", "year": 2022,
            "engine_cc": 199, "mileage_kmpl": 35.0, "type": BikeType.adventure,
        },
    },
    {
        "name": "Sneha Reddy",
        "email": "sneha@ryder.com",
        "phone": "+91 98765 40014",
        "bio": "Hyderabad rider group regular. Temple runs, lake rides, and a lot of biryani stops.",
        "home_city": "Hyderabad", "home_latitude": 17.3850, "home_longitude": 78.4867,
        "bike": {
            "name": "Aster", "model": "TVS Ronin", "year": 2023,
            "engine_cc": 225, "mileage_kmpl": 32.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Aditya Joshi",
        "email": "aditya@ryder.com",
        "phone": "+91 98765 40015",
        "bio": "Mountain-obsessed. If there's a hairpin bend within riding distance, I've probably found it.",
        "home_city": "Nagpur", "home_latitude": 21.1458, "home_longitude": 79.0882,
        "bike": {
            "name": "Ridgeback", "model": "Royal Enfield Hunter 350", "year": 2024,
            "engine_cc": 349, "mileage_kmpl": 36.0, "type": BikeType.commuter,
        },
    },
    {
        "name": "Divya Menon",
        "email": "divya@ryder.com",
        "phone": "+91 98765 40016",
        "bio": "Coastal rider through and through. ECR at dawn is my favourite kind of therapy.",
        "home_city": "Coimbatore", "home_latitude": 11.0168, "home_longitude": 76.9558,
        "bike": {
            "name": "Tide", "model": "Honda CB350RS", "year": 2023,
            "engine_cc": 348, "mileage_kmpl": 33.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Rohan Malhotra",
        "email": "rohan@ryder.com",
        "phone": "+91 98765 40017",
        "bio": "Group ride captain for a Delhi riding club. Big on trip planning spreadsheets.",
        "home_city": "Delhi", "home_latitude": 28.7041, "home_longitude": 77.1025,
        "bike": {
            "name": "Voyager", "model": "Bajaj Pulsar NS200", "year": 2022,
            "engine_cc": 199, "mileage_kmpl": 34.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Ishita Sharma",
        "email": "ishita@ryder.com",
        "phone": "+91 98765 40018",
        "bio": "New rider, six months in, already planning a Spiti trip for next season.",
        "home_city": "Lucknow", "home_latitude": 26.8467, "home_longitude": 80.9462,
        "bike": {
            "name": "Comet", "model": "Yamaha FZ-X", "year": 2024,
            "engine_cc": 149, "mileage_kmpl": 41.0, "type": BikeType.commuter,
        },
    },
    {
        "name": "Varun Pillai",
        "email": "varun@ryder.com",
        "phone": "+91 98765 40019",
        "bio": "Backwater roads and hill-station food trails. Kerala born, Kerala ridden.",
        "home_city": "Thiruvananthapuram", "home_latitude": 8.5241, "home_longitude": 76.9366,
        "bike": {
            "name": "Monsoon", "model": "Royal Enfield Classic 350", "year": 2022,
            "engine_cc": 349, "mileage_kmpl": 34.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Kavya Desai",
        "email": "kavya@ryder.com",
        "phone": "+91 98765 40020",
        "bio": "Weekend escapes from the city grind. Waterfall season is my favourite season.",
        "home_city": "Surat", "home_latitude": 21.1702, "home_longitude": 72.8311,
        "bike": {
            "name": "Drift", "model": "Suzuki Gixxer SF250", "year": 2023,
            "engine_cc": 249, "mileage_kmpl": 30.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Siddharth Bose",
        "email": "siddharth@ryder.com",
        "phone": "+91 98765 40021",
        "bio": "Kolkata-based tourer. East coast beach runs and the odd Sikkim expedition.",
        "home_city": "Kolkata", "home_latitude": 22.5726, "home_longitude": 88.3639,
        "bike": {
            "name": "Cyclone", "model": "Royal Enfield Meteor 350", "year": 2023,
            "engine_cc": 349, "mileage_kmpl": 32.0, "type": BikeType.cruiser,
        },
    },
    {
        "name": "Meera Pillai",
        "email": "meera@ryder.com",
        "phone": "+91 98765 40022",
        "bio": "Photography-first rider - I plan routes around the best light, not the shortest distance.",
        "home_city": "Bhopal", "home_latitude": 23.2599, "home_longitude": 77.4126,
        "bike": {
            "name": "Lantern", "model": "Honda Hornet 2.0", "year": 2023,
            "engine_cc": 184, "mileage_kmpl": 35.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Aakash Chauhan",
        "email": "aakash@ryder.com",
        "phone": "+91 98765 40023",
        "bio": "Bought my first bike last year and haven't had a boring weekend since.",
        "home_city": "Guwahati", "home_latitude": 26.1445, "home_longitude": 91.7362,
        "bike": {
            "name": "Northbound", "model": "Hero Karizma XMR", "year": 2024,
            "engine_cc": 210, "mileage_kmpl": 31.0, "type": BikeType.sport,
        },
    },
    {
        "name": "Tanvi Kulkarni",
        "email": "tanvi@ryder.com",
        "phone": "+91 98765 40024",
        "bio": "Ghat-road regular out of Pune. Mahabaleshwar and Lonavala on rotation most weekends.",
        "home_city": "Pune", "home_latitude": 18.5204, "home_longitude": 73.8567,
        "bike": {
            "name": "Sable", "model": "Bajaj Avenger Cruise 220", "year": 2022,
            "engine_cc": 220, "mileage_kmpl": 33.0, "type": BikeType.cruiser,
        },
    },
]


# ---------------------------------------------------------------------------
# Destinations - 38 entries spread across major Indian riding regions
# ---------------------------------------------------------------------------
def _dest(name, description, region, lat, lng, terrain, food_cost, entry_cost,
          season, tod, tags):
    hero, gallery = _destination_images(name)
    return {
        "name": name,
        "description": description,
        "region": region,
        "latitude": lat,
        "longitude": lng,
        "terrain_difficulty": terrain,
        "estimated_food_cost": food_cost,
        "estimated_entry_cost": entry_cost,
        "best_season": season,
        "best_time_of_day": tod,
        "hero_media_url": hero,
        "tag_slugs": tags,
        "gallery": gallery,
    }


DESTINATIONS = [
    # --- Karnataka (Bangalore-adjacent) ---
    _dest(
        "Nandi Hills",
        "Classic weekend sunrise ride near Bangalore. 60km of rolling plains "
        "then a 6km hill climb with sharp hairpins. Best in the cool early "
        "morning mist before the crowd arrives.",
        "Karnataka", 13.3702, 77.6835, TerrainDifficulty.moderate, 300, 50,
        "Year-round, peak Oct-Feb", "Pre-dawn for sunrise",
        ["viewpoint", "mountain", "offbeat", "any"],
    ),
    _dest(
        "Skandagiri",
        "Night-trek-and-ride favourite an hour north of Bangalore. Riders park "
        "at the base and trek up for the sunrise cloud sea, then ride back for "
        "breakfast in the city.",
        "Karnataka", 13.4739, 77.6801, TerrainDifficulty.moderate, 250, 100,
        "Oct-Feb for the cloud sea", "Late night start for pre-dawn summit",
        ["viewpoint", "mountain", "offbeat", "any"],
    ),
    _dest(
        "Savandurga",
        "Monolith hill an easy hour from Bangalore, popular with first-time "
        "tourers for its short distance and rewarding rocky viewpoint at the "
        "base.",
        "Karnataka", 12.9202, 77.2842, TerrainDifficulty.chill, 200, 0,
        "Oct-Mar", "Morning start to beat the heat",
        ["viewpoint", "offbeat", "any"],
    ),
    _dest(
        "Muthyala Maduvu",
        "Pearl Valley waterfall trip on the outskirts of Bangalore. Short ride, "
        "steep steps down to the falls, and a good beginner-friendly loop for a "
        "half-day escape.",
        "Karnataka", 12.8060, 77.4230, TerrainDifficulty.chill, 200, 30,
        "Jun-Sep for full flow", "Morning",
        ["waterfall", "offbeat", "any"],
    ),
    _dest(
        "Ramanagara",
        "Rocky monolith hills an hour from Bangalore on NICE Road/Mysore "
        "highway - famous as the Sholay shooting location and now a vulture "
        "sanctuary. Short, scenic, and an easy after-work ride.",
        "Karnataka", 12.7217, 77.2812, TerrainDifficulty.chill, 200, 30,
        "Oct-Mar", "Late afternoon for golden-hour rock light",
        ["viewpoint", "mountain", "offbeat", "any"],
    ),
    _dest(
        "Devarayanadurga",
        "Forested hill-temple ride out of Tumkur - two temples atop a "
        "boulder-strewn hill reached via a winding forest road, with a "
        "cooler microclimate than the plains below.",
        "Karnataka", 13.3667, 77.2833, TerrainDifficulty.moderate, 250, 20,
        "Year-round", "Morning",
        ["forest", "temple", "offbeat", "any"],
    ),
    _dest(
        "Bannerghatta",
        "Forest and wildlife loop on Bangalore's southern edge - a shaded "
        "ride past the national park and biological park, popular as a "
        "quick escape without a full day commitment.",
        "Karnataka", 12.8000, 77.5771, TerrainDifficulty.chill, 300, 80,
        "Year-round, avoid peak monsoon", "Morning",
        ["forest", "offbeat", "any"],
    ),
    _dest(
        "Antaragange",
        "Volcanic rock-hill trek-and-ride near Kolar with a cave temple "
        "circuit at the summit - a compact, offbeat half-day loop east of "
        "Bangalore.",
        "Karnataka", 13.1500, 78.1300, TerrainDifficulty.moderate, 200, 20,
        "Oct-Feb", "Early morning before the rocks heat up",
        ["mountain", "temple", "offbeat", "any"],
    ),
    _dest(
        "Sangama",
        "River-confluence ride via Kanakapura Road where the Arkavathy meets "
        "the Cauvery - forested backroads for most of the way, with a quiet "
        "riverside stop at the end.",
        "Karnataka", 12.4167, 77.2833, TerrainDifficulty.moderate, 250, 20,
        "Oct-Feb, avoid monsoon flooding", "Morning",
        ["forest", "offbeat", "any"],
    ),
    _dest(
        "Gokarna",
        "Temple town meets beach paradise. Coastal NH-66 ride, ending at "
        "quieter beaches than Goa. Om Beach and Kudle Beach are within walking "
        "distance. A regular long-weekend run for riders out of Bangalore.",
        "Karnataka", 14.5479, 74.3188, TerrainDifficulty.moderate, 500, 0,
        "Oct-Mar", "Start at dawn to beat the coastal heat",
        ["beach", "coastal", "temple", "any"],
    ),
    _dest(
        "Chikmagalur",
        "Coffee country hill station under 250km from Bangalore. Winding ghat "
        "roads through plantation shade, peaks of the Bababudangiri range, and "
        "filter coffee at every stop.",
        "Karnataka", 13.3161, 75.7720, TerrainDifficulty.moderate, 400, 50,
        "Sep-Mar", "Any; fog is common in mornings",
        ["mountain", "forest", "food-trail", "100cc_plus"],
    ),
    # --- Maharashtra (Mumbai/Pune-adjacent) ---
    _dest(
        "Lonavala",
        "The default monsoon ride for Mumbai and Pune riders. Waterfalls line "
        "the Old Mumbai-Pune Highway, with Tiger's Leap and Bhushi Dam as the "
        "usual stops.",
        "Maharashtra", 18.7537, 73.4068, TerrainDifficulty.chill, 400, 50,
        "Jun-Sep for waterfalls", "Morning, before highway traffic builds",
        ["waterfall", "mountain", "viewpoint", "any"],
    ),
    _dest(
        "Mahabaleshwar",
        "Strawberry-country hill station out of Pune with sweeping Sahyadri "
        "viewpoints. Roads are well-paved but full of switchbacks, popular "
        "with cruiser and tourer groups alike.",
        "Maharashtra", 17.9307, 73.6477, TerrainDifficulty.moderate, 450, 50,
        "Oct-Feb", "Morning",
        ["viewpoint", "mountain", "food-trail", "any"],
    ),
    _dest(
        "Malshej Ghat",
        "Monsoon-only spectacle a few hours from Mumbai - waterfalls on both "
        "sides of the road and flamingo sightings at the lake below when the "
        "clouds roll in.",
        "Maharashtra", 19.4374, 73.7550, TerrainDifficulty.moderate, 350, 0,
        "Jul-Sep", "Morning, roads get slick by afternoon",
        ["waterfall", "mountain", "offbeat", "150cc_plus"],
    ),
    _dest(
        "Matheran",
        "Vehicle-free hill station near Mumbai - you ride to the base and "
        "walk in, but the ghat approach itself is a proper riders' road with "
        "tight hairpins and forest cover.",
        "Maharashtra", 18.9871, 73.2704, TerrainDifficulty.moderate, 300, 50,
        "Oct-Mar", "Morning",
        ["viewpoint", "forest", "offbeat", "any"],
    ),
    _dest(
        "Igatpuri",
        "Ghat-section ride out of Mumbai/Nashik famous for Bhatsa river valley "
        "viewpoint and monsoon waterfalls right off the highway.",
        "Maharashtra", 19.6969, 73.5626, TerrainDifficulty.moderate, 350, 0,
        "Jul-Oct", "Morning",
        ["waterfall", "viewpoint", "mountain", "150cc_plus"],
    ),
    # --- Tamil Nadu (Chennai/Coimbatore-adjacent) ---
    _dest(
        "Yelagiri",
        "Compact hill station between Bangalore and Chennai, known for its "
        "20-hairpin ghat climb - a favourite short weekend loop for both "
        "cities' riders.",
        "Tamil Nadu", 12.5847, 78.6314, TerrainDifficulty.moderate, 350, 0,
        "Oct-Mar", "Morning",
        ["mountain", "viewpoint", "offbeat", "any"],
    ),
    _dest(
        "Yercaud",
        "Quieter alternative to Ooty, reached via a 20-hairpin ghat road from "
        "Salem. Coffee and orange plantations line the route.",
        "Tamil Nadu", 11.7753, 78.2088, TerrainDifficulty.moderate, 350, 0,
        "Sep-Mar", "Morning",
        ["mountain", "forest", "food-trail", "100cc_plus"],
    ),
    _dest(
        "Ooty",
        "The Nilgiris' signature hill station, reachable from Coimbatore via "
        "the 36-hairpin climb through Coonoor. Tea estates, pine forests, and "
        "cold mornings.",
        "Tamil Nadu", 11.4102, 76.6950, TerrainDifficulty.rough, 500, 50,
        "Oct-May", "Early morning start from Coimbatore",
        ["mountain", "forest", "viewpoint", "150cc_plus"],
    ),
    _dest(
        "Kodaikanal",
        "Princess of hill stations, reached via the Batlagundu ghat with over "
        "20 hairpins through shola forest. A proper long-day ride from "
        "Coimbatore or Madurai.",
        "Tamil Nadu", 10.2381, 77.4892, TerrainDifficulty.rough, 500, 50,
        "Sep-May", "Early morning",
        ["mountain", "forest", "viewpoint", "150cc_plus"],
    ),
    _dest(
        "Pondicherry via ECR",
        "The classic East Coast Road run out of Chennai - flat, fast, coastal "
        "tarmac all the way, with beach shacks and Auroville detours along "
        "the way.",
        "Tamil Nadu", 11.9139, 79.8145, TerrainDifficulty.chill, 500, 0,
        "Nov-Feb", "Early morning to beat traffic out of Chennai",
        ["coastal", "beach", "food-trail", "any"],
    ),
    # --- Telangana / Andhra Pradesh (Hyderabad-adjacent) ---
    _dest(
        "Ananthagiri Hills",
        "Closest forest ghat ride to Hyderabad - a tight, tree-lined climb "
        "past a coffee plantation and a small waterfall, popular for quick "
        "morning rides.",
        "Telangana", 17.1181, 78.1191, TerrainDifficulty.moderate, 250, 0,
        "Jul-Feb", "Early morning",
        ["forest", "waterfall", "offbeat", "any"],
    ),
    _dest(
        "Pakhal Lake",
        "Offbeat lake-and-forest ride out of Warangal, quiet even on "
        "weekends, with a boating point and dense teak forest along the "
        "approach road.",
        "Telangana", 17.9800, 79.9500, TerrainDifficulty.moderate, 300, 30,
        "Oct-Feb", "Morning",
        ["forest", "offbeat", "any"],
    ),
    _dest(
        "Warangal Fort",
        "Kakatiya-era fort ride from Hyderabad, flat highway most of the way "
        "with a rewarding stop at the carved stone gateways.",
        "Telangana", 17.9689, 79.5941, TerrainDifficulty.chill, 300, 25,
        "Oct-Mar", "Morning",
        ["fort", "temple", "any"],
    ),
    _dest(
        "Nagarjuna Sagar",
        "Dam-and-reservoir ride from Hyderabad along wide highway, with the "
        "island Buddhist museum as the reward at the far end.",
        "Telangana", 16.5738, 79.3122, TerrainDifficulty.chill, 350, 100,
        "Oct-Feb", "Morning",
        ["viewpoint", "any"],
    ),
    # --- Delhi-NCR ---
    _dest(
        "Lansdowne",
        "Quiet Uttarakhand hill station roughly 5 hours from Delhi with none "
        "of the tourist crowds. Pine forests, colonial architecture, and "
        "sweeping views of the Himalayan range on clear days.",
        "Uttarakhand", 29.8378, 78.6867, TerrainDifficulty.rough, 400, 0,
        "Mar-Jun, Sep-Nov", "Start early from Delhi (5am) to beat traffic",
        ["mountain", "forest", "offbeat", "150cc_plus"],
    ),
    _dest(
        "Nahan",
        "Himachal border town a comfortable day ride from Delhi - winding "
        "hill roads through sal forest with far fewer riders than the usual "
        "Himachal circuit.",
        "Himachal Pradesh", 30.5590, 77.2999, TerrainDifficulty.moderate, 350, 0,
        "Mar-Jun, Sep-Nov", "Early morning start from Delhi",
        ["mountain", "forest", "offbeat", "150cc_plus"],
    ),
    _dest(
        "Chakrata",
        "Cantonment hill town near Dehradun, roughly 7 hours from Delhi, with "
        "tight forest roads leading to the Tiger Falls trailhead.",
        "Uttarakhand", 30.7038, 77.8656, TerrainDifficulty.rough, 400, 0,
        "Mar-Jun, Sep-Nov", "Early morning",
        ["waterfall", "forest", "offbeat", "adventure"],
    ),
    _dest(
        "Kasauli",
        "Compact Himachal hill station, a manageable day trip from Delhi via "
        "Chandigarh, with cedar-lined roads and a proper viewpoint at Monkey "
        "Point.",
        "Himachal Pradesh", 30.8989, 76.9649, TerrainDifficulty.moderate, 350, 0,
        "Mar-Jun, Sep-Nov", "Morning",
        ["mountain", "viewpoint", "any"],
    ),
    _dest(
        "Sariska",
        "Tiger reserve ride out of Delhi via Alwar - wide Rajasthan highway "
        "followed by a scenic approach road through the buffer forest.",
        "Rajasthan", 27.3238, 76.4419, TerrainDifficulty.chill, 400, 200,
        "Oct-Mar", "Morning",
        ["forest", "offbeat", "any"],
    ),
    # --- West Bengal (Kolkata-adjacent) ---
    _dest(
        "Mandarmani",
        "Kolkata riders' go-to beach run - a rare drivable beach in India, "
        "flat coastal road practically the whole way from the city.",
        "West Bengal", 21.6647, 87.6928, TerrainDifficulty.chill, 400, 0,
        "Oct-Feb", "Morning",
        ["beach", "coastal", "any"],
    ),
    _dest(
        "Digha",
        "Classic weekend beach town from Kolkata, well-paved highway most of "
        "the way with a lively seafood-and-beach-shack scene at the end.",
        "West Bengal", 21.6274, 87.5083, TerrainDifficulty.chill, 400, 0,
        "Oct-Feb", "Morning",
        ["beach", "coastal", "food-trail", "any"],
    ),
    # --- Rajasthan ---
    _dest(
        "Pushkar",
        "Desert temple town a comfortable ride from Jaipur, with camel fair "
        "grounds and lakeside ghats worth the dusty highway stretch.",
        "Rajasthan", 26.4899, 74.5511, TerrainDifficulty.moderate, 350, 0,
        "Oct-Mar", "Morning to avoid the desert heat",
        ["temple", "offbeat", "any"],
    ),
    _dest(
        "Jaisalmer",
        "Golden Fort city deep in the Thar - a proper multi-day tourer's "
        "destination out of Jaipur, with long straight highway and dune-field "
        "detours.",
        "Rajasthan", 26.9157, 70.9083, TerrainDifficulty.rough, 500, 100,
        "Nov-Feb only, brutal heat otherwise", "Early morning starts, avoid midday",
        ["fort", "offbeat", "150cc_plus"],
    ),
    _dest(
        "Udaipur",
        "Lake city ride through the Aravalli hills from Jaipur, with palace "
        "viewpoints and a proper ghat section near Gogunda.",
        "Rajasthan", 24.5854, 73.7125, TerrainDifficulty.moderate, 450, 100,
        "Oct-Mar", "Morning",
        ["fort", "viewpoint", "any"],
    ),
    # --- Kerala ---
    _dest(
        "Munnar",
        "Tea-garden hill station reached via a long ghat climb, popular with "
        "riders out of Kochi and Thiruvananthapuram alike for its rolling "
        "green hills.",
        "Kerala", 10.0889, 77.0595, TerrainDifficulty.moderate, 450, 50,
        "Sep-Mar", "Early morning",
        ["mountain", "viewpoint", "food-trail", "150cc_plus"],
    ),
    _dest(
        "Wayanad",
        "Forest-and-waterfall district in north Kerala, with the Thamarassery "
        "ghat's nine hairpins the signature approach ride.",
        "Kerala", 11.6854, 76.1320, TerrainDifficulty.rough, 400, 50,
        "Oct-May", "Early morning",
        ["waterfall", "forest", "mountain", "150cc_plus"],
    ),
    _dest(
        "Vagamon",
        "Rolling meadow hill station in the Kerala highlands, quieter than "
        "Munnar, with a mix of tea, pine, and rubber estates along the ride.",
        "Kerala", 9.6875, 76.9080, TerrainDifficulty.moderate, 350, 0,
        "Sep-Mar", "Morning",
        ["mountain", "offbeat", "viewpoint", "any"],
    ),
    # --- Goa ---
    _dest(
        "Goa Coastal Loop",
        "The full north-to-south beach loop, a long-weekend staple for riders "
        "out of Mumbai and Pune - flat coastal roads linking a dozen beaches "
        "and a fort or two.",
        "Goa", 15.2993, 74.1240, TerrainDifficulty.chill, 500, 0,
        "Nov-Feb", "Any; ride early to avoid tourist traffic",
        ["beach", "coastal", "fort", "any"],
    ),
    # --- Himachal Pradesh ---
    _dest(
        "Tirthan Valley",
        "Hidden gem in Himachal - trout streams, wooden cottages, pine "
        "forests. Road quality deteriorates after Banjar, but the payoff is "
        "unreal.",
        "Himachal Pradesh", 31.6200, 77.4200, TerrainDifficulty.rough, 600, 0,
        "Apr-Jun, Sep-Nov", "Start in the morning, reach by evening",
        ["mountain", "forest", "offbeat", "150cc_plus", "adventure"],
    ),
    _dest(
        "Spiti Valley",
        "High-altitude cold desert, the definitive Himalayan tourer's "
        "destination. Multi-day ride, thin air, river crossings, and no "
        "margin for mechanical error.",
        "Himachal Pradesh", 32.2461, 78.0349, TerrainDifficulty.rough, 700, 0,
        "Jun-Sep only, passes close otherwise", "Early morning, river melt",
        ["mountain", "offbeat", "adventure", "4x4_only"],
    ),
    # --- Uttarakhand ---
    _dest(
        "Mussoorie",
        "Queen of the Hills above Dehradun - a well-paved, well-loved ghat "
        "climb with mist-covered viewpoints most mornings.",
        "Uttarakhand", 30.4598, 78.0664, TerrainDifficulty.moderate, 400, 0,
        "Mar-Jun, Sep-Nov", "Morning",
        ["mountain", "viewpoint", "any"],
    ),
    _dest(
        "Nainital",
        "Lake-district hill station in Kumaon, popular loop road around the "
        "lake plus a genuinely technical approach ghat from the plains.",
        "Uttarakhand", 29.3803, 79.4636, TerrainDifficulty.moderate, 400, 50,
        "Mar-Jun, Sep-Nov", "Morning",
        ["mountain", "viewpoint", "forest", "150cc_plus"],
    ),
]


# ---------------------------------------------------------------------------
# Feed content templates - used to build realistic RideLog + Post + engagement
# activity across the seeded users/destinations.
# ---------------------------------------------------------------------------
RECAP_TEMPLATES = [
    "Rode up to {dest} this weekend with the crew. Roads were {road}, weather "
    "held up, and the {vibe} views were worth every hairpin. Already planning "
    "the next trip.",
    "Solo run to {dest} today. Left before sunrise, roads were mostly "
    "{road}, and the {vibe} stretch near the top made the early wake-up "
    "completely worth it.",
    "Finally ticked {dest} off the list. Conditions were {road} in patches "
    "but nothing the bike couldn't handle. Highly recommend the {vibe} spot "
    "for photos.",
    "Group ride to {dest} - six bikes, one puncture, zero regrets. The "
    "{vibe} section was the highlight, roads {road} throughout.",
    "Quick weekend escape to {dest}. Traffic out of the city was the hardest "
    "part; once we hit the ghat the roads turned {road} and the {vibe} "
    "scenery took over.",
]

STANDALONE_TEMPLATES = [
    "Servicing the bike this week before the next long ride. Anyone got a "
    "trusted mechanic recommendation along the {dest} route?",
    "Throwback to last season's ride to {dest} - still one of my favourite "
    "rides on this bike. Due for a repeat soon.",
    "New tyres fitted, chain cleaned, gear checked. Ready for whatever route "
    "the group decides this weekend. {dest} is on the shortlist.",
    "Planning a {dest} run next month, looking for two more riders to join. "
    "Moderate pace, one overnight stop.",
]

ROAD_PHRASES = ["mostly good", "a bit rough in sections", "smooth all the way", "patchy after the ghat", "surprisingly well maintained"]
VIBE_WORDS = ["waterfall", "viewpoint", "forest", "coastal", "temple", "mountain", "lake"]

COMMENT_TEMPLATES = [
    "Great shots! Adding this to my list.",
    "How were the fuel stops along the way?",
    "Did that same route last year, roads have improved a lot since then.",
    "Which route did you take in?",
    "Looks like a solid weekend. What time did you leave?",
    "Been wanting to do this one. Any tips for a first-timer?",
    "That view at the top is unreal.",
    "Careful on the way down, heard there's loose gravel near the last bend.",
]


def _build_feed_activity(db, users: list[User], destinations: list[Destination]) -> None:
    """Creates completed RidePlans + RideLogs, Posts (ride recaps and
    standalone), and a spread of likes/comments across different users.

    Deterministic (fixed RNG seed) so re-running against a fresh DB produces
    the same shape of activity, which keeps the seed genuinely idempotent in
    spirit even though the outer guard only checks for User existence.
    """
    rng = random.Random(20260826)
    now = datetime.now(timezone.utc)

    # --- Ride plans + ride logs: every user gets 1-2 completed rides, each
    # with a terrain-matched photo (same destination image bank as the
    # destination cards themselves, so a ride log for a coastal spot shows a
    # coastal photo, not whatever a random seed happened to return). ---
    ride_logs: list[RideLog] = []
    for user in users:
        for _ in range(rng.randint(1, 2)):
            dest = rng.choice(destinations)
            days_ago = rng.randint(1, 45)
            planned = date.today() - timedelta(days=days_ago)
            plan = RidePlan(
                destination_id=dest.id,
                captain_id=user.id,
                title=f"Ride to {dest.name}",
                description=f"Solo/group log for a completed ride to {dest.name}.",
                planned_date=planned,
                planned_start_time=time(6, 30),
                estimated_end_time=time(18, 0),
                visibility=RidePlanVisibility.solo,
                difficulty_level=rng.choice(list(DifficultyLevel)),
                max_riders=rng.choice([1, 2, 4, 6]),
                status=RidePlanStatus.completed,
            )
            db.add(plan)
            db.flush()

            start_ts = datetime.combine(planned, time(6, 30), tzinfo=timezone.utc)
            end_ts = start_ts + timedelta(hours=rng.randint(6, 12))
            log = RideLog(
                ride_plan_id=plan.id,
                rider_id=user.id,
                actual_start_ts=start_ts,
                actual_end_ts=end_ts,
                actual_cost=rng.randint(500, 3500),
                road_condition=rng.choice(list(RoadCondition)),
                recommended=rng.random() > 0.15,
                notes="Logged via seed data.",
            )
            db.add(log)
            db.flush()

            bucket = DESTINATION_TERRAIN.get(dest.name, "viewpoint")
            photo_ids = TERRAIN_IMAGES[bucket]
            photo_id = photo_ids[rng.randrange(len(photo_ids))]
            db.add(
                RideMedia(
                    ride_log_id=log.id,
                    url=picsum_id(photo_id),
                    media_type=MediaType.image,
                    uploaded_by_user_id=user.id,
                    caption=f"On the road to {dest.name}",
                )
            )
            ride_logs.append(log)
            log._destination = dest  # stash for post generation below

    # --- Posts: a ride recap for every ride log, plus enough standalone
    # posts that every user ends up with 2-3 posts total and the feed reads
    # as recently active (all within the last two weeks). ---
    posts: list[Post] = []
    posts_by_author: dict[str, int] = {}

    for log in ride_logs:
        dest = log._destination
        template = rng.choice(RECAP_TEMPLATES)
        caption = template.format(
            dest=dest.name,
            road=rng.choice(ROAD_PHRASES),
            vibe=rng.choice(VIBE_WORDS),
        )
        # Photos surface automatically from the linked ride_log's media
        # (see feed.py) - no separate photo field on Post itself.
        post = Post(
            author_id=log.rider_id,
            ride_log_id=log.id,
            caption=caption,
            created_at=now - timedelta(days=rng.randint(0, 13), hours=rng.randint(0, 23)),
        )
        db.add(post)
        posts.append(post)
        posts_by_author[log.rider_id] = posts_by_author.get(log.rider_id, 0) + 1

    # Top up standalone posts so every user has at least 2, and most reach 3.
    for user in users:
        have = posts_by_author.get(user.id, 0)
        target = rng.choice([2, 2, 3])
        for _ in range(max(0, target - have)):
            dest = rng.choice(destinations)
            template = rng.choice(STANDALONE_TEMPLATES)
            caption = template.format(dest=dest.name)
            post = Post(
                author_id=user.id,
                caption=caption,
                created_at=now - timedelta(days=rng.randint(0, 13), hours=rng.randint(0, 23)),
            )
            db.add(post)
            posts.append(post)

    db.flush()

    # --- Likes + comments spread across different users so the feed doesn't
    # look like one person talking to themselves. ---
    for post in posts:
        likers = rng.sample(users, k=min(len(users), rng.randint(0, 8)))
        for liker in likers:
            if liker.id == post.author_id:
                continue
            db.add(PostLike(post_id=post.id, user_id=liker.id))

        commenters = rng.sample(users, k=min(len(users), rng.randint(0, 3)))
        for commenter in commenters:
            db.add(
                PostComment(
                    post_id=post.id,
                    author_id=commenter.id,
                    body=rng.choice(COMMENT_TEMPLATES),
                    created_at=post.created_at + timedelta(hours=rng.randint(1, 72)),
                )
            )


UPCOMING_RIDE_TITLES = [
    "Sunrise run to {d}", "Weekend loop to {d}", "{d} for the coffee and curves",
    "First-timer friendly ride to {d}", "Monsoon chase to {d}", "Early morning {d} run",
    "Long weekend to {d}", "After-work escape to {d}", "{d} - anyone free Saturday?",
    "Group cruise to {d}", "Open ride to {d}", "No-approval-needed cruise to {d}",
]

UPCOMING_RIDE_CHAT_MESSAGES = [
    "Excited for this one, what time are we meeting?",
    "Bringing my GoPro, someone remind me to charge it.",
    "Weather looks decent for Saturday, fingers crossed.",
    "First time on this route, any tips?",
    "I'll bring a puncture kit just in case.",
    "Can we do a fuel stop about halfway?",
    "Count me in, see you all there.",
    "Anyone else riding a smaller cc bike? Wondering about pace.",
    "Let's meet 15 min early for a quick group photo before we set off.",
    "Perfect, this is exactly the kind of ride I needed this week.",
]


def _build_upcoming_group_rides(db, users: list[User], destinations: list[Destination]) -> None:
    """Future, joinable group rides with an active chat group each - what
    /rides and /chat actually need to not be empty right after signup.
    _build_feed_activity above only creates *completed* solo ride history
    (for the profile stats + feed recap), which is a different surface.

    Two of the ten are seeded with requires_approval=False and one with
    max_riders=None, so both new ride-creation options actually have a
    live example to exercise instead of only existing in the create form.
    """
    rng = random.Random(20260826)
    now = datetime.now(timezone.utc)

    captains = rng.sample(users, k=min(10, len(users)))
    for i, captain in enumerate(captains):
        dest = rng.choice(destinations)
        planned = date.today() + timedelta(days=rng.randint(3, 45))
        title = rng.choice(UPCOMING_RIDE_TITLES).format(d=dest.name)
        open_ride = i >= 7

        plan = RidePlan(
            destination_id=dest.id,
            captain_id=captain.id,
            title=title,
            description=f"Group ride to {dest.name}. Moderate pace, all riders welcome.",
            planned_date=planned,
            planned_start_time=time(6, 30),
            estimated_end_time=time(18, 0),
            visibility=RidePlanVisibility.group,
            difficulty_level=rng.choice(list(DifficultyLevel)),
            max_riders=None if i == 9 else rng.choice([4, 6, 8, 10]),
            requires_approval=not open_ride,
            status=RidePlanStatus.planned,
        )
        db.add(plan)
        db.flush()

        chat = ChatGroup(ride_plan_id=plan.id, name=plan.title)
        db.add(chat)
        db.flush()

        pool = [u for u in users if u.id != captain.id]
        approved = rng.sample(pool, k=min(rng.randint(2, 5), len(pool)))
        pending = rng.sample(
            [u for u in pool if u not in approved],
            k=min(rng.randint(0, 2), max(0, len(pool) - len(approved))),
        )

        for u in approved:
            db.add(RidePlanParticipant(ride_plan_id=plan.id, user_id=u.id, status=ParticipantStatus.approved))
        for u in pending:
            db.add(RidePlanParticipant(ride_plan_id=plan.id, user_id=u.id, status=ParticipantStatus.pending))

        participants = [captain] + approved
        base_time = now - timedelta(days=rng.randint(0, 3))
        for m in range(rng.randint(2, 5)):
            author = rng.choice(participants)
            db.add(ChatMessage(
                chat_group_id=chat.id,
                author_id=author.id,
                body=rng.choice(UPCOMING_RIDE_CHAT_MESSAGES),
                created_at=base_time + timedelta(minutes=m * rng.randint(5, 90)),
            ))

    db.flush()


def seed() -> None:
    db = SessionLocal()
    try:
        # Tags are only ever created here - there's no user-facing endpoint
        # that inserts a Tag row - so their presence is a reliable "have we
        # already seeded" marker. Checking for *any* User instead (the old
        # guard) meant one stray manual signup permanently blocked the real
        # dataset from ever loading, with no error to say why.
        if db.query(Tag).first():
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
        for slug, name, description, rarity in BADGES:
            db.add(Badge(slug=slug, name=name, description=description, rarity=BadgeRarity(rarity)))
        print(f"Seeded {len(BADGES)} badges")

        # Users + bikes
        users: list[User] = []
        for ud in USERS:
            existing = db.query(User).filter(User.email == ud["email"]).first()
            if existing:
                # A real signup (e.g. someone testing the running app) beat
                # the seed to this email - keep their account rather than
                # crashing on a duplicate-email constraint, just skip
                # re-creating the demo bike/profile for this one slot.
                users.append(existing)
                continue
            user = User(
                name=ud["name"],
                email=ud["email"],
                phone=ud["phone"],
                bio=ud["bio"],
                avatar_url=picsum(f"{slugify(ud['name'])}-avatar", 200, 200),
                home_city=ud["home_city"],
                home_latitude=ud["home_latitude"],
                home_longitude=ud["home_longitude"],
                password_hash=hash_password("password123"),
                # First seeded account doubles as the dev admin - otherwise
                # the moderation queue has no way to be exercised at all
                # (no signup flow grants is_admin; it has to start somewhere).
                is_admin=(ud["email"] == "alex@ryder.com"),
            )
            db.add(user)
            db.flush()
            users.append(user)

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

        # Follow graph: every user follows 3-6 others. Run twice with
        # different shuffles so a decent number of pairs end up mutual
        # (needed for DMs, which only unlock between mutual followers) -
        # a single one-directional pass would make almost every pair
        # one-way and leave DMs untestable.
        follow_rng = random.Random(20260826)
        follow_pairs: set[tuple] = set()
        for _pass in range(2):
            for u in users:
                others = [o for o in users if o.id != u.id]
                follow_rng.shuffle(others)
                for o in others[: follow_rng.randint(3, 6)]:
                    follow_pairs.add((u.id, o.id))
        for follower_id, followed_id in follow_pairs:
            db.add(Follow(follower_id=follower_id, followed_id=followed_id))
        db.flush()
        mutual_count = sum(1 for a, b in follow_pairs if (b, a) in follow_pairs) // 2
        print(f"Seeded {len(follow_pairs)} follows ({mutual_count} mutual pairs)")

        # Destinations + tags + gallery
        destinations: list[Destination] = []
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
            destinations.append(dest)

            for slug in dd["tag_slugs"]:
                tag = tag_map.get(slug)
                if tag is None:
                    raise RuntimeError(f"Seed references unknown tag slug: {slug}")
                db.add(DestinationTag(destination_id=dest.id, tag_id=tag.id))

            for url in dd["gallery"]:
                db.add(DestinationMedia(destination_id=dest.id, url=url))
        print(f"Seeded {len(DESTINATIONS)} destinations with tags + gallery")

        # Feed activity: ride logs + posts + likes + comments
        _build_feed_activity(db, users, destinations)
        db.flush()
        post_count = db.query(Post).count()
        ride_log_count = db.query(RideLog).count()
        like_count = db.query(PostLike).count()
        comment_count = db.query(PostComment).count()
        print(
            f"Seeded {ride_log_count} ride logs, {post_count} posts, "
            f"{like_count} likes, {comment_count} comments"
        )

        # Upcoming joinable group rides + their chat groups - what /rides
        # and /chat actually render; the feed activity above is all
        # already-completed history.
        _build_upcoming_group_rides(db, users, destinations)
        db.flush()
        upcoming_count = (
            db.query(RidePlan)
            .filter(RidePlan.status == RidePlanStatus.planned, RidePlan.visibility == RidePlanVisibility.group)
            .count()
        )
        chat_group_count = db.query(ChatGroup).count()
        print(f"Seeded {upcoming_count} upcoming group rides with {chat_group_count} chat groups")

        db.commit()
        print("Seed complete.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
