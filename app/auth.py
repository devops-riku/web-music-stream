from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db import get_db
from app.models import User

SECRET_KEY = "rikupy-super-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password[:72], hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Return the logged-in user if a valid JWT is provided, else None."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        auth_id: str = payload.get("sub")
        if not auth_id:
            return None
    except JWTError:
        return None

    user = db.scalar(select(User).where(User.auth_id == auth_id))
    return user


def get_current_user_or_guest(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Return the logged-in user. If no token, return/create the guest user."""
    user = get_current_user(credentials, db)
    if user:
        return user

    # Fall back to guest
    guest_id = "guest_user"
    guest = db.scalar(select(User).where(User.auth_id == guest_id))
    if not guest:
        guest = User(
            auth_id=guest_id,
            display_name="Guest User",
            email="guest@example.com",
            profile_image="https://ui-avatars.com/api/?name=Guest+User"
        )
        db.add(guest)
        db.commit()
        db.refresh(guest)
    return guest
