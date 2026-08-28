"""Model package.

Importing this package triggers registration of every ORM class with
Base.metadata, which Alembic's env.py relies on to see the full schema.
Keep this list in sync with the files under app/models/.
"""
from app.models.user import User  # noqa: F401
from app.models.ride import (  # noqa: F401
    Bike,
    BikeType,
    DifficultyLevel,
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.models.destination import (  # noqa: F401
    Destination,
    DestinationMedia,
    DestinationTag,
    Rating,
    Tag,
    TagCategory,
    TerrainDifficulty,
)
from app.models.route import Route, RoutePoint  # noqa: F401
from app.models.ride_log import (  # noqa: F401
    MediaType,
    RideLog,
    RideLogComment,
    RideMedia,
    RoadCondition,
)
from app.models.social import Discussion, DiscussionComment, Follow  # noqa: F401
from app.models.badge import Badge, BadgeRarity, UserBadge  # noqa: F401
from app.models.chat import ChatGroup, ChatMessage  # noqa: F401
from app.models.post import Post, PostComment, PostLike  # noqa: F401
from app.models.notification import Notification, NotificationType  # noqa: F401
from app.models.report import Report, ReportStatus, ReportTargetType  # noqa: F401
from app.models.direct_message import DMThread, DirectMessage  # noqa: F401
from app.models.trip import Trip, TripRideLog  # noqa: F401
from app.models.club import (  # noqa: F401
    Club,
    ClubBadge,
    ClubChallenge,
    ClubMembership,
    ClubRole,
    UserClubBadge,
)
from app.models.event import Event, EventRSVP, RSVPStatus  # noqa: F401
from app.models.hazard import HAZARD_DECAY, HazardReport, HazardType  # noqa: F401
from app.models.push_token import PushToken  # noqa: F401
