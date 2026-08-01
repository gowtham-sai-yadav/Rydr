RELEASE_CHECKS = ("seed data", "destination search", "ride capacity", "feed API", "chat authorization")


def ready_for_staging(failures: list[str]) -> bool:
    return not failures
