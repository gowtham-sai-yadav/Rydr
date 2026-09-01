"""Engine and session factory.

Pool settings assume the database is a network hop away and sits behind a
connection pooler (Supabase's session pooler, Render's managed Postgres, or
plain Postgres in Docker for local work). Everything here is chosen for the
pooled case, which is the strictest.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    # A pooler drops connections it considers idle, and the client is not
    # told. Without a liveness check SQLAlchemy hands a dead connection to a
    # request and it fails on first use -- intermittently, under no load, in a
    # way that reads as random 500s. pre_ping costs one round trip per
    # checkout and removes the whole failure mode.
    pool_pre_ping=True,
    # Recycle below the idle timeout of every pooler we target, so connections
    # are replaced on our schedule rather than dropped on theirs.
    pool_recycle=1800,
    # Deliberately small. Supabase's free tier caps pooled client connections,
    # and this app holds a session for the life of each chat WebSocket on top
    # of its request traffic, so an unbounded overflow exhausts the budget
    # under exactly the load a demo produces.
    pool_size=5,
    max_overflow=5,
    pool_timeout=30,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
