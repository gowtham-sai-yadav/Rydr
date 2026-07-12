def can_confirm(capacity: int, confirmed: int) -> bool:
    return confirmed < capacity


def should_waitlist(capacity: int, confirmed: int, requested: int = 1) -> bool:
    return confirmed + requested > capacity
