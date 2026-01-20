from sqlalchemy.orm import Session

from .models import AuditLog


def log_action(db: Session, user_id: int | None, action: str, entity_type: str, entity_id: int | None, details: str | None = None) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    db.add(entry)
    db.commit()
