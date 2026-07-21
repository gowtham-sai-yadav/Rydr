REPORT_STATES = ("open", "reviewing", "actioned", "dismissed")


def report_payload(content_id: int, reporter_id: int, reason: str) -> dict:
    return {"content_id": content_id, "reporter_id": reporter_id, "reason": reason}
