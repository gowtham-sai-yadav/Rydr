def leaderboard_entry(user_id: int, username: str, score: float, rides: int) -> dict:
    return {"user_id": user_id, "username": username, "score": round(score, 2), "rides": rides}


def seed_ready(users: int, destinations: int) -> bool:
    return users >= 10 and destinations >= 20
