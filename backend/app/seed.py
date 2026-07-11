"""Seed script - populates the demo dataset for the M1 schema, plus a
realistic user base, a broad destination library, and social feed activity.

Idempotent: skips if any User already exists.
Run via: python -m app.seed  (from backend/)

Images: every URL in this file uses Picsum Photos' deterministic seeded
endpoint (``https://picsum.photos/seed/<seed>/<w>/<h>``). Unlike hand-picked
Unsplash photo IDs (which rot - dead/moved photo IDs are common and there's
no way to verify dozens of them without live network access), a Picsum seed
always resolves to a real image, so nothing ever renders as a broken-image
icon.
"""
from __future__ import annotations

import random
import re
from datetime import date, datetime, time, timedelta, timezone

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
from app.models.post import Post, PostComment, PostLike
from app.models.ride import (
    Bike,
    BikeType,
    DifficultyLevel,
    RidePlan,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.models.ride_log import MediaType, RideLog, RideMedia, RoadCondition
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Image helper
# ---------------------------------------------------------------------------
def picsum(seed: str, w: int = 800, h: int = 500) -> str:
    """Deterministic, always-resolving image URL for a given seed string."""
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


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
    slug = slugify(name)
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
        "hero_media_url": picsum(f"{slug}-hero"),
        "tag_slugs": tags,
        "gallery": [picsum(f"{slug}-gallery-1"), picsum(f"{slug}-gallery-2")],
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

    # --- Ride plans + ride logs: give ~2/3 of users a completed ride each on
    # a destination near their home city (falls back to any destination). ---
    ride_logs: list[RideLog] = []
    for user in users:
        if rng.random() > 0.7:
            continue
        dest = rng.choice(destinations)
        days_ago = rng.randint(3, 180)
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

        if rng.random() > 0.5:
            slug = slugify(dest.name)
            db.add(
                RideMedia(
                    ride_log_id=log.id,
                    url=picsum(f"{slug}-ridelog-{user.email.split('@')[0]}"),
                    media_type=MediaType.image,
                    uploaded_by_user_id=user.id,
                    caption=f"On the road to {dest.name}",
                )
            )
        ride_logs.append(log)
        log._destination = dest  # stash for post generation below

    # --- Posts: ride recaps for some logs, plus standalone text posts. ---
    posts: list[Post] = []

    for log in ride_logs:
        if rng.random() > 0.6:
            continue
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
            created_at=log.actual_end_ts + timedelta(hours=rng.randint(1, 48)),
        )
        db.add(post)
        posts.append(post)

    # Standalone posts (no ride log) to round the feed out to ~20 total.
    target_total = 22
    while len(posts) < target_total:
        user = rng.choice(users)
        dest = rng.choice(destinations)
        template = rng.choice(STANDALONE_TEMPLATES)
        caption = template.format(dest=dest.name)
        post = Post(
            author_id=user.id,
            caption=caption,
            created_at=now - timedelta(days=rng.randint(0, 60), hours=rng.randint(0, 23)),
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
        users: list[User] = []
        for ud in USERS:
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

        db.commit()
        print("Seed complete.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
