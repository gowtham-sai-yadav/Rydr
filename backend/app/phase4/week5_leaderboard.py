def leaderboard_row(user_id: int, username: str, score: float, rides: int) -> dict:
    return {
        "user_id": user_id,
        "username": username,
        "score": round(score, 2),
        "rides": rides,
    }


def is_seed_ready(total_users: int, total_destinations: int) -> bool:
    return total_users >= 10 and total_destinations >= 20

