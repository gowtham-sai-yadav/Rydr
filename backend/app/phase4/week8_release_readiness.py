RELEASE_BLOCKERS = [
    "seed consistency failures",
    "ride capacity edge-case regressions",
    "chat auth mismatch",
]


def release_ready(open_blockers: list[str]) -> bool:
    return len(open_blockers) == 0

