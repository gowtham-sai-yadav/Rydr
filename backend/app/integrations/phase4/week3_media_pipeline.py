def signed_upload_scope(user_id: int, asset_kind: str) -> str:
    return f"phase4/{user_id}/{asset_kind}"


def thumbnail_job(source_url: str, frame_at_sec: int = 2) -> dict:
    return {"source_url": source_url, "frame_at_sec": frame_at_sec, "status": "queued"}

