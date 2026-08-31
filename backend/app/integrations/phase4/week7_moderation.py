REPORT_STATUSES = ("open", "reviewing", "actioned", "dismissed")


def report_payload(content_id: int, reason: str, reporter_id: int) -> dict:
    return {"content_id": content_id, "reason": reason, "reporter_id": reporter_id}

