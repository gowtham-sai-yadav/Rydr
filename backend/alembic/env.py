from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import the models package so every ORM class is registered with Base.metadata.
from app.database import Base  # noqa: E402
from app.config import settings  # noqa: E402
import app.models  # noqa: E402,F401

target_metadata = Base.metadata

# Phase 4 W7: take the database URL from application settings, which read
# DATABASE_URL from the environment, rather than from the hardcoded
# sqlalchemy.url in alembic.ini.
#
# Previously env.py used the ini value unconditionally, so `alembic upgrade
# head` migrated the development database no matter what DATABASE_URL said.
# That meant the test database silently stayed empty while the command
# reported success, and it would have pointed a staging or production deploy
# at localhost. The ini value remains as the fallback for anyone running
# alembic with no environment configured.
_url = settings.DATABASE_URL or config.get_main_option("sqlalchemy.url")
config.set_main_option("sqlalchemy.url", _url)


def run_migrations_offline() -> None:
    context.configure(
        url=_url, target_metadata=target_metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
