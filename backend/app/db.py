"""Database connection (Supabase / Postgres) — optional.

Only imported lazily from app.sellers when DATABASE_URL is set. If it isn't,
or a query fails, app.sellers falls back to its built-in seed data instead —
so the app never hard-depends on this module or on sqlalchemy/psycopg2 being
installed.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

Base = declarative_base()

DATABASE_URL = os.getenv("DATABASE_URL", "")


@lru_cache(maxsize=1)
def get_engine():
    return create_engine(DATABASE_URL, pool_pre_ping=True)


@lru_cache(maxsize=1)
def _session_factory():
    return sessionmaker(bind=get_engine())


@contextmanager
def get_session():
    session = _session_factory()()
    try:
        yield session
    finally:
        session.close()


# Tables already checked/migrated in this process — avoids re-running the
# column check on every single request once a table has been confirmed.
_ensured: set[str] = set()


def ensure_tables(*model_classes) -> None:
    """Create tables for the given models if they don't exist yet (idempotent),
    and add any columns the model declares that the live table is missing.

    This project has no migration tool (Alembic etc.) — create_all(checkfirst=True)
    only creates brand-new tables, it never alters one that already exists. Without
    this, adding a column to a model (e.g. image_url) would silently do nothing to
    a table that was created before that column existed, and every write touching
    that column would then fail against the live database.
    """
    engine = get_engine()
    Base.metadata.create_all(engine, tables=[m.__table__ for m in model_classes], checkfirst=True)

    with engine.begin() as conn:
        for model in model_classes:
            table = model.__table__
            if table.name in _ensured:
                continue
            for column in table.columns:
                ddl_type = column.type.compile(dialect=engine.dialect)
                try:
                    conn.execute(text(
                        f'ALTER TABLE "{table.name}" ADD COLUMN IF NOT EXISTS "{column.name}" {ddl_type}'
                    ))
                except Exception:
                    logger.warning(
                        "Could not ensure column %s.%s exists", table.name, column.name, exc_info=True,
                    )
            _ensured.add(table.name)
