"""Seed script to populate demo data."""
from app.database import SessionLocal
from app.models.user import User
from app.models.ride import Bike, Ride, RideStop, RideParticipant, RideStatus, DifficultyLevel, ParticipantStatus
from app.models.chat import ChatGroup
from app.services.auth_service import hash_password


def seed():
    db = SessionLocal()

    # Check if already seeded
    if db.query(User).first():
        print("Database already has data, skipping seed.")
        db.close()
        return

    # Create users — all fields filled, everyone has a proper profile
    users_data = [
        {
            "name": "Alex Rider", "email": "alex@ryder.com", "phone": "+1 (310) 555-0147",
            "bio": "Weekend warrior with 6 years on two wheels. Love canyon roads, mountain passes, and chasing sunrises. Rode coast-to-coast twice. Always down for a dawn patrol.",
            "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
        },
        {
            "name": "Sam Cruz", "email": "sam@ryder.com", "phone": "+1 (213) 555-0238",
            "bio": "Adventure rider and off-road junkie. 8 years of riding, 40k+ miles logged. If the road is paved, it's too easy. GS gang for life.",
            "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face",
        },
        {
            "name": "Jordan Miles", "email": "jordan@ryder.com", "phone": "+1 (424) 555-0391",
            "bio": "Cruiser enthusiast and sunset chaser. 4 years riding, mostly coastal routes. Slow rides, good vibes, great coffee stops. Let's roll.",
            "avatar_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
        },
        {
            "name": "Casey Storm", "email": "casey@ryder.com", "phone": "+1 (818) 555-0472",
            "bio": "Track day regular turned touring rider. 10 years in the saddle, from Laguna Seca to the PCH. Wrenches on weekends, rides on weekdays.",
            "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face",
        },
        {
            "name": "Riley Vance", "email": "riley@ryder.com", "phone": "+1 (626) 555-0583",
            "bio": "Night rider and city explorer. 3 years on a naked bike, mostly urban routes and mountain twisties after dark. Big fan of late-night diner stops.",
            "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face",
        },
        {
            "name": "Morgan Blake", "email": "morgan@ryder.com", "phone": "+1 (562) 555-0614",
            "bio": "Dual-sport addict. 5 years splitting time between fire roads and highways. If there's gravel, I'm in. Desert runs are my happy place.",
            "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face",
        },
    ]

    users = []
    for ud in users_data:
        u = User(
            name=ud["name"], email=ud["email"], phone=ud["phone"],
            bio=ud["bio"], avatar_url=ud["avatar_url"],
            password_hash=hash_password("password123"),
        )
        db.add(u)
        db.flush()
        users.append(u)

    # Create bikes — every user has a fully filled-out bike
    bikes_data = [
        {"name": "Shadow", "model": "Honda CB650R", "year": 2023},
        {"name": "Desert Fox", "model": "BMW R1250GS Adventure", "year": 2022},
        {"name": "Thunderbird", "model": "Royal Enfield Classic 350", "year": 2024},
        {"name": "Bolt", "model": "Kawasaki Z900", "year": 2023},
        {"name": "Phantom", "model": "Yamaha MT-07", "year": 2024},
        {"name": "Nomad", "model": "KTM 390 Adventure", "year": 2023},
    ]
    for i, bd in enumerate(bikes_data):
        b = Bike(user_id=users[i].id, name=bd["name"], model=bd["model"], year=bd["year"])
        db.add(b)

    # ---- COMPLETED RIDES (past, already happened) ----
    completed_rides_data = [
        {
            "captain": users[0], "title": "Pacific Coast Sunrise Run",
            "description": "A beautiful morning ride along the Pacific Coast Highway. We caught the sunrise at Point Dume and cruised down to Malibu for coffee. Perfect weather, zero issues.",
            "thumbnail_url": "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800",
            "ride_date": "2024-01-15", "start_time": "06:00", "estimated_end_time": "11:00",
            "difficulty": DifficultyLevel.moderate, "bike_type": "Sport / Naked", "max_riders": 8,
            "break_schedule": "Coffee break at mile 30, lunch at Neptune's Net",
            "status": RideStatus.completed,
            "participants": [users[1], users[2], users[3], users[4]],
            "stops": [
                {"name": "Point Dume Overlook", "description": "Sunrise viewing spot — arrived just in time for golden hour", "order": 1, "lat": 34.0019, "lng": -118.8066},
                {"name": "Malibu Pier", "description": "Quick photo stop, parked along PCH", "order": 2, "lat": 34.0359, "lng": -118.6775},
                {"name": "Neptune's Net", "description": "Coffee, breakfast burritos, and bike talk", "order": 3, "lat": 34.0516, "lng": -118.9334, "is_break": True},
            ],
        },
        {
            "captain": users[1], "title": "Angeles Crest Twisties",
            "description": "Tackled the twisties through Angeles Crest Highway. Challenging elevation changes with incredible views of the valley below. Everyone kept pace, solid group.",
            "thumbnail_url": "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800",
            "ride_date": "2024-02-10", "start_time": "08:00", "estimated_end_time": "14:00",
            "difficulty": DifficultyLevel.hard, "bike_type": "Adventure / Sport", "max_riders": 6,
            "break_schedule": "Rest stop every 45 minutes, lunch at Newcomb's Ranch",
            "status": RideStatus.completed,
            "participants": [users[0], users[3], users[5]],
            "stops": [
                {"name": "La Cañada Flintridge Shell Station", "description": "Meetup point, topped off tanks", "order": 1, "lat": 34.2103, "lng": -118.1878},
                {"name": "Newcomb's Ranch", "description": "Legendary biker hangout — burgers and cold drinks", "order": 2, "lat": 34.3583, "lng": -118.0578, "is_break": True},
                {"name": "Mt Wilson Observatory", "description": "Photo op with panoramic city views", "order": 3, "lat": 34.2258, "lng": -118.0575},
            ],
        },
        {
            "captain": users[2], "title": "Coastal Cruiser Sunset",
            "description": "A relaxed cruise along the coast from Santa Monica to Palos Verdes. Perfect for kicking back and enjoying the ocean breeze. Ended with ice cream at Hermosa.",
            "thumbnail_url": "https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=800",
            "ride_date": "2024-02-28", "start_time": "15:00", "estimated_end_time": "19:30",
            "difficulty": DifficultyLevel.easy, "bike_type": "Any", "max_riders": 12,
            "break_schedule": "Frequent stops for photos and refreshments",
            "status": RideStatus.completed,
            "participants": [users[0], users[1], users[3], users[4], users[5]],
            "stops": [
                {"name": "Santa Monica Pier", "description": "Starting point — parking lot A, easy meetup", "order": 1, "lat": 34.0094, "lng": -118.4973},
                {"name": "Venice Beach Boardwalk", "description": "Quick walk, street performers were out", "order": 2, "lat": 33.9850, "lng": -118.4695},
                {"name": "Hermosa Beach", "description": "Ice cream and beach break — The Strand Creamery", "order": 3, "lat": 33.8622, "lng": -118.3995, "is_break": True},
                {"name": "Palos Verdes Lookout", "description": "Final scenic viewpoint, caught the sunset perfectly", "order": 4, "lat": 33.7555, "lng": -118.3850},
            ],
        },
        {
            "captain": users[3], "title": "Night Ride: City Lights",
            "description": "LA from two wheels after dark. Hit all the iconic lit-up landmarks and ended at Mel's Drive-In. The Griffith Observatory views were unreal.",
            "thumbnail_url": "https://images.unsplash.com/photo-1558980664-769d59546b3d?w=800",
            "ride_date": "2024-03-08", "start_time": "20:00", "estimated_end_time": "23:30",
            "difficulty": DifficultyLevel.moderate, "bike_type": "Street / Naked", "max_riders": 10,
            "break_schedule": "One mid-ride stop at Mel's for food",
            "status": RideStatus.completed,
            "participants": [users[0], users[1], users[2], users[4], users[5]],
            "stops": [
                {"name": "Griffith Observatory", "description": "City skyline views — jaw-dropping at night", "order": 1, "lat": 34.1184, "lng": -118.3004},
                {"name": "Hollywood Sign Viewpoint", "description": "Night photo opportunity, surprisingly quiet", "order": 2, "lat": 34.1341, "lng": -118.3215},
                {"name": "Mel's Drive-In", "description": "Late night burgers, shakes, and ride stories", "order": 3, "lat": 34.0983, "lng": -118.3617, "is_break": True},
            ],
        },
        {
            "captain": users[0], "title": "Joshua Tree Desert Run",
            "description": "Full day out in the desert. Long straights, beautiful rock formations, and total freedom. Keys View at golden hour was the highlight.",
            "thumbnail_url": "https://images.unsplash.com/photo-1547549082-6bc09f2049ae?w=800",
            "ride_date": "2024-03-22", "start_time": "07:00", "estimated_end_time": "17:00",
            "difficulty": DifficultyLevel.expert, "bike_type": "Adventure / Touring", "max_riders": 5,
            "break_schedule": "Hydration stops every 30 min, lunch at Keys View",
            "status": RideStatus.completed,
            "participants": [users[1], users[3], users[5]],
            "stops": [
                {"name": "Cabazon Dinosaurs", "description": "Quirky roadside landmark — mandatory photo", "order": 1, "lat": 33.9292, "lng": -116.7828},
                {"name": "Joshua Tree Entrance", "description": "Park entrance, regrouped and hydrated", "order": 2, "lat": 33.8734, "lng": -115.9009},
                {"name": "Keys View", "description": "Panoramic desert views, lunch with a view", "order": 3, "lat": 33.9217, "lng": -116.1445, "is_break": True},
                {"name": "Skull Rock", "description": "Quick hike and group photo at the rock", "order": 4, "lat": 33.9950, "lng": -116.0525},
            ],
        },
    ]

    # ---- OPEN RIDES (upcoming, accepting riders) ----
    open_rides_data = [
        {
            "captain": users[1], "title": "Big Sur Weekend Expedition",
            "description": "Two-day ride up to Big Sur and back. We'll take Highway 1 through some of the most scenic coastal roads in the world. Overnight at a campsite near Pfeiffer Beach.",
            "thumbnail_url": "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800",
            "ride_date": "2024-05-18", "start_time": "06:30", "estimated_end_time": "18:00",
            "difficulty": DifficultyLevel.hard, "bike_type": "Adventure / Touring", "max_riders": 6,
            "break_schedule": "Breakfast at Ventura, lunch at San Simeon, dinner at camp",
            "status": RideStatus.open,
            "participants": [
                (users[0], ParticipantStatus.approved),
                (users[3], ParticipantStatus.approved),
                (users[5], ParticipantStatus.pending),
            ],
            "stops": [
                {"name": "Ventura Harbor", "description": "Fuel up and grab breakfast tacos", "order": 1, "lat": 34.2483, "lng": -119.2613},
                {"name": "San Simeon Bay", "description": "Lunch stop, elephant seal viewpoint nearby", "order": 2, "lat": 35.6430, "lng": -121.1896, "is_break": True},
                {"name": "Bixby Creek Bridge", "description": "Iconic bridge photo stop", "order": 3, "lat": 36.3714, "lng": -121.9016},
                {"name": "Pfeiffer Beach Campsite", "description": "Overnight camp — bring a tent or hammock", "order": 4, "lat": 36.2380, "lng": -121.8153, "is_break": True},
            ],
        },
        {
            "captain": users[0], "title": "Mulholland Drive Morning Loop",
            "description": "Classic LA canyon carving along Mulholland. Fast sweepers, tight switchbacks, and killer views of the valley and ocean. Intermediate+ skill recommended.",
            "thumbnail_url": "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
            "ride_date": "2024-05-25", "start_time": "07:00", "estimated_end_time": "11:30",
            "difficulty": DifficultyLevel.moderate, "bike_type": "Sport / Naked", "max_riders": 8,
            "break_schedule": "Coffee stop at Rock Store, water break at overlook",
            "status": RideStatus.open,
            "participants": [
                (users[2], ParticipantStatus.approved),
                (users[4], ParticipantStatus.approved),
                (users[5], ParticipantStatus.approved),
            ],
            "stops": [
                {"name": "Cahuenga Pass Meetup", "description": "Gas station at the 101 exit, easy to find", "order": 1, "lat": 34.1275, "lng": -118.3389},
                {"name": "The Rock Store", "description": "Legendary biker coffee stop on Mulholland", "order": 2, "lat": 34.0881, "lng": -118.7361, "is_break": True},
                {"name": "Mulholland Overlook", "description": "Valley panoramic view, quick water break", "order": 3, "lat": 34.1214, "lng": -118.5806},
                {"name": "Malibu Canyon Finish", "description": "Wrap up at the PCH junction", "order": 4, "lat": 34.0350, "lng": -118.6831},
            ],
        },
        {
            "captain": users[4], "title": "Griffith Park Night Cruise",
            "description": "Chill night ride through Griffith Park and the Hollywood Hills. Easy pace, good vibes, and we'll end at a taco truck in Los Feliz. Perfect for all skill levels.",
            "thumbnail_url": "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800",
            "ride_date": "2024-06-01", "start_time": "20:30", "estimated_end_time": "23:00",
            "difficulty": DifficultyLevel.easy, "bike_type": "Any", "max_riders": 15,
            "break_schedule": "Taco stop at the end",
            "status": RideStatus.open,
            "participants": [
                (users[0], ParticipantStatus.approved),
                (users[1], ParticipantStatus.approved),
                (users[2], ParticipantStatus.pending),
                (users[3], ParticipantStatus.approved),
            ],
            "stops": [
                {"name": "Los Feliz Blvd Meetup", "description": "Parking lot by the Greek Theatre", "order": 1, "lat": 34.1175, "lng": -118.2961},
                {"name": "Griffith Observatory Loop", "description": "Ride up to the observatory for city views", "order": 2, "lat": 34.1184, "lng": -118.3004},
                {"name": "Hollywood Sign Viewpoint", "description": "Quick stop for a nighttime photo", "order": 3, "lat": 34.1341, "lng": -118.3215},
                {"name": "Leo's Taco Truck", "description": "Best al pastor in LA — the perfect finish", "order": 4, "lat": 34.1012, "lng": -118.2920, "is_break": True},
            ],
        },
        {
            "captain": users[3], "title": "Palomar Mountain Challenge",
            "description": "Serious mountain ride up to Palomar Observatory. 6,000 ft elevation gain, 50+ turns, and thin air at the top. Not for beginners — bring your A-game.",
            "thumbnail_url": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800",
            "ride_date": "2024-06-08", "start_time": "06:00", "estimated_end_time": "15:00",
            "difficulty": DifficultyLevel.expert, "bike_type": "Sport / Adventure", "max_riders": 5,
            "break_schedule": "Hydration break every 40 min, lunch at Mother's Kitchen",
            "status": RideStatus.open,
            "participants": [
                (users[1], ParticipantStatus.approved),
                (users[0], ParticipantStatus.pending),
            ],
            "stops": [
                {"name": "Escondido Gas & Go", "description": "Fuel up, last gas for 60 miles", "order": 1, "lat": 33.1192, "lng": -117.0864},
                {"name": "Lake Henshaw Vista", "description": "Panoramic lake view, stretch break", "order": 2, "lat": 33.2337, "lng": -116.7622},
                {"name": "Mother's Kitchen", "description": "Vegetarian restaurant at the summit — surprisingly good", "order": 3, "lat": 33.3262, "lng": -116.8672, "is_break": True},
                {"name": "Palomar Observatory", "description": "The famous 200-inch Hale Telescope", "order": 4, "lat": 33.3564, "lng": -116.8650},
            ],
        },
    ]

    # Create completed rides
    for rd in completed_rides_data:
        ride = Ride(
            captain_id=rd["captain"].id,
            title=rd["title"],
            description=rd["description"],
            thumbnail_url=rd["thumbnail_url"],
            ride_date=rd["ride_date"],
            start_time=rd["start_time"],
            estimated_end_time=rd["estimated_end_time"],
            difficulty_level=rd["difficulty"],
            recommended_bike_type=rd["bike_type"],
            break_schedule=rd["break_schedule"],
            max_riders=rd["max_riders"],
            status=rd["status"],
        )
        db.add(ride)
        db.flush()

        for s in rd["stops"]:
            stop = RideStop(
                ride_id=ride.id, name=s["name"], description=s["description"],
                stop_order=s["order"], latitude=s["lat"], longitude=s["lng"],
                is_break_stop=s.get("is_break", False),
            )
            db.add(stop)

        chat = ChatGroup(ride_id=ride.id, name=rd["title"])
        db.add(chat)

        # All participants approved for completed rides
        for u in rd["participants"]:
            p = RideParticipant(ride_id=ride.id, user_id=u.id, status=ParticipantStatus.approved)
            db.add(p)

    # Create open rides
    for rd in open_rides_data:
        ride = Ride(
            captain_id=rd["captain"].id,
            title=rd["title"],
            description=rd["description"],
            thumbnail_url=rd["thumbnail_url"],
            ride_date=rd["ride_date"],
            start_time=rd["start_time"],
            estimated_end_time=rd["estimated_end_time"],
            difficulty_level=rd["difficulty"],
            recommended_bike_type=rd["bike_type"],
            break_schedule=rd["break_schedule"],
            max_riders=rd["max_riders"],
            status=rd["status"],
        )
        db.add(ride)
        db.flush()

        for s in rd["stops"]:
            stop = RideStop(
                ride_id=ride.id, name=s["name"], description=s["description"],
                stop_order=s["order"], latitude=s["lat"], longitude=s["lng"],
                is_break_stop=s.get("is_break", False),
            )
            db.add(stop)

        chat = ChatGroup(ride_id=ride.id, name=rd["title"])
        db.add(chat)

        # Mixed participant statuses for open rides
        for u, status in rd["participants"]:
            p = RideParticipant(ride_id=ride.id, user_id=u.id, status=status)
            db.add(p)

    db.commit()
    db.close()
    print("Seed data created successfully!")


if __name__ == "__main__":
    seed()
