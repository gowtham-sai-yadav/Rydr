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
from app.models.ride_log import MediaType, RideLog, RideMedia, RoadCondition  # noqa: F401
from app.models.social import Discussion, DiscussionComment, Follow  # noqa: F401
from app.models.badge import Badge, UserBadge  # noqa: F401
from app.models.chat import ChatGroup, ChatMessage  # noqa: F401
from app.models.post import (  # noqa: F401
    Post,
    PostComment,
    PostLike,
    PostMedia,
    PostMediaType,
)
from app.models.notification import (  # noqa: F401
    EntityType,
    Notification,
    NotificationType,
)
