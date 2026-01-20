from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal
from .models import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_login_attempts: dict[str, tuple[int, datetime]] = {}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenziali non valide.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Permessi amministratore richiesti.")
    return user


def rate_limit_login(username: str) -> None:
    now = datetime.utcnow()
    attempts, last_time = _login_attempts.get(username, (0, now))
    if (now - last_time).total_seconds() > 300:
        attempts = 0
    attempts += 1
    _login_attempts[username] = (attempts, now)
    if attempts > 5:
        raise HTTPException(status_code=429, detail="Troppi tentativi. Riprova tra pochi minuti.")


def reset_rate_limit(username: str) -> None:
    _login_attempts.pop(username, None)
