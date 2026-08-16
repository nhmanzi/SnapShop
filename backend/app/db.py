"""Database connection (Supabase / Postgres) — optional.

Only imported lazily from app.sellers when DATABASE_URL is set. If it isn't,
or a query fails, app.sellers falls back to its built-in seed data instead —
so the app never hard-depends on this module or on sqlalchemy/psycopg2 being
installed.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

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
