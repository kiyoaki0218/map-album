# backend/crud.py
from sqlalchemy.orm import Session
from backend import models, schemas
import hashlib
from datetime import datetime, timedelta

# Admin List (Hardcoded for stability)
ADMIN_USERNAMES = ["user_7c7fkpiie", "user_wqldnphp4", "user_nihj67h3l", "user_5ibklldsx"]

# --- User Operations ---

def get_user_by_username(db: Session, username: str):
    user = db.query(models.User).filter(models.User.username == username).first()
    return user

def get_user(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user

def create_user(db: Session, user: schemas.UserCreate):
    # In a real app, use bcrypt or argon2! This is a simple placeholder.
    fake_hashed_password = user.password + "notreallyhashed" 
    db_user = models.User(
        username=user.username, 
        hashed_password=fake_hashed_password,
        display_name=user.display_name,
        icon=user.icon,
        kc_address=user.kc_address
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user: schemas.UserCreate):
    db_user = get_user_by_username(db, username=user.username)
    if db_user:
        db_user.display_name = user.display_name
        db_user.icon = user.icon
        db.commit()
        db.refresh(db_user)
    return db_user

# --- Media Operations ---

def create_user_media(db: Session, media: schemas.MediaCreate, user_id: int, filename: str, filepath: str):
    db_media = models.Media(
        **media.dict(),
        owner_id=user_id,
        filename=filename,
        filepath=filepath
    )
    db.add(db_media)
    db.commit()
    db.refresh(db_media)
    return db_media

def get_all_media(db: Session):
    return db.query(models.Media).all()

def delete_media(db: Session, media_id: int, user_id: int):
    media = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not media:
        return False

    # Check requestor
    user = get_user(db, user_id)
    if not user:
        return False

    # Check if owner OR admin
    if media.owner_id == user_id or user.username in ADMIN_USERNAMES:
        db.delete(media)
        db.commit()
        return True
    
    return False

def delete_all_media(db: Session):
    try:
        db.query(models.Media).delete()
        db.commit()
        return True
    except:
        return False

# --- Comment Operations ---

def create_comment(db: Session, comment: schemas.CommentCreate, user_id: int, media_id: int):
    db_comment = models.Comment(
        **comment.dict(),
        owner_id=user_id,
        media_id=media_id
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

def delete_comment(db: Session, comment_id: int, user_id: int):
    # Security: Owner OR Admin can delete
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        return False

    # Check requestor
    user = get_user(db, user_id)
    if not user:
        return False

    # Admin List (Sync with Frontend)
    # Check if owner OR admin (hardcoded list only, no is_admin column in DB)
    if db_comment.owner_id == user_id or user.username in ADMIN_USERNAMES:
        db.delete(db_comment)
        db.commit()
        return True
    return False

# --- Like Operations ---

def get_like(db: Session, user_id: int, media_id: int):
    """Check if user has liked a specific media"""
    return db.query(models.Like).filter(
        models.Like.user_id == user_id,
        models.Like.media_id == media_id
    ).first()

def create_like(db: Session, user_id: int, media_id: int):
    """Add a like (returns existing if already liked)"""
    existing = get_like(db, user_id, media_id)
    if existing:
        return existing
    
    db_like = models.Like(user_id=user_id, media_id=media_id)
    db.add(db_like)
    db.commit()
    db.refresh(db_like)
    return db_like

def delete_like(db: Session, user_id: int, media_id: int):
    """Remove a like"""
    db_like = get_like(db, user_id, media_id)
    if db_like:
        db.delete(db_like)
        db.commit()
        return True
    return False

def toggle_like(db: Session, user_id: int, media_id: int):
    """
    Toggle like status.
    """
    existing = get_like(db, user_id, media_id)
    
    if existing:
        db.delete(existing)
        liked = False
    else:
        db_like = models.Like(user_id=user_id, media_id=media_id)
        db.add(db_like)
        liked = True
    
    db.commit() # Single commit for atomic transaction
        
    like_count = db.query(models.Like).filter(models.Like.media_id == media_id).count()
    return liked, like_count

def get_like_count(db: Session, media_id: int):
    """Get the number of likes for a media"""
    return db.query(models.Like).filter(models.Like.media_id == media_id).count()

def update_user_profile(db: Session, user_id: int, display_name: str = None, icon: str = None, kc_address: str = None):
    """Update user display_name, icon, and/or kc_address"""
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        if display_name is not None:
            db_user.display_name = display_name
        if icon is not None:
            db_user.icon = icon
        if kc_address is not None:
            db_user.kc_address = kc_address
        db.commit()
        db.refresh(db_user)
    return db_user


