from dataclasses import dataclass


@dataclass(frozen=True)
class DataAuditItem:
    area: str
    expected: str


PHASE4_AUDIT = (
    DataAuditItem("destinations", "schema, filters, seed data"),
    DataAuditItem("rides", "capacity, waitlist, ride logs"),
    DataAuditItem("reviews", "rating and review lifecycle"),
)
