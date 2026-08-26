from dataclasses import dataclass


@dataclass(frozen=True)
class Phase4AuditItem:
    milestone: str
    action: str
    owner: str = "Navneet"


W1_AUDIT_ITEMS = [
    Phase4AuditItem("M2", "Audit destination schema and API payload parity"),
    Phase4AuditItem("M3", "Audit ride participant flow against waitlist path"),
    Phase4AuditItem("M4", "Draft seed-script contract for demo data generation"),
]

