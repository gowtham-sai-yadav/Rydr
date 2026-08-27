def can_join_room(is_member: bool, is_blocked: bool) -> bool:
    return is_member and not is_blocked


def message_policy() -> dict:
    return {"persist": True, "max_payload_bytes": 8192}
