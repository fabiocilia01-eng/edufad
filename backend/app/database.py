from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import get_settings


class Base(DeclarativeBase):
    pass


def get_engine():
    settings = get_settings()
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(settings.database_url, connect_args=connect_args, future=True)


engine = get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
