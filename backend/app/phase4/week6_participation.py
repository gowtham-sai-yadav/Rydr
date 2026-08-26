def can_confirm_participant(capacity: int, confirmed_count: int) -> bool:
    return confirmed_count < capacity


def should_waitlist(capacity: int, confirmed_count: int, requested_count: int = 1) -> bool:
    return confirmed_count + requested_count > capacity

