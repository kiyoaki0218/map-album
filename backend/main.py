# backend/main.py
import uvicorn
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, APIRouter
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager
import os
from datetime import datetime

from backend import models, schemas, crud, database

@asynccontextmanager
async def lifespan(app: FastAPI):
    # For Vercel, we do not run create_all on every request.
    # Tables should be created manually or via a separate migration script.
    yield

app = FastAPI(title="Map Album API", lifespan=lifespan)

# CORS (Vercel serves frontend from same domain, but allow all for dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All API endpoints under /api prefix
router = APIRouter(prefix="/api")

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Health check
@router.get("/health")
def health_check():
    return {"status": "healthy"}

# --- User Endpoints ---

@router.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    
    if db_user:
        updated_user = crud.update_user_profile(
            db=db, 
            user_id=db_user.id, 
            display_name=user.display_name, 
            icon=user.icon
        )
        return updated_user
    
    return crud.create_user(db=db, user=user)

@router.get("/users/{username}", response_model=schemas.UserPublic)
def read_user(username: str, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

# --- Media Endpoints ---

@router.post("/upload/", response_model=schemas.Media)
async def upload_media(
    file: UploadFile = File(...),
    latitude: float = Form(None),
    longitude: float = Form(None),
    description: str = Form(None),
    taken_at: str = Form(None),
    username: str = Form(...),
    db: Session = Depends(get_db)
):
    user = crud.get_user_by_username(db, username=username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    import uuid
    from backend import cloudinary_utils
    
    file_extension = os.path.splitext(file.filename)[1]
    if not file_extension:
        file_extension = ".jpg"
    
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_content = await file.read()
    
    cloudinary_url = cloudinary_utils.upload_image(file_content, unique_filename)
    
    if cloudinary_url:
        file_location = cloudinary_url
    else:
        raise HTTPException(status_code=500, detail="Could not upload image to Cloudinary")
    
    parsed_date = None
    if taken_at:
        try:
            parsed_date = datetime.fromisoformat(taken_at)
        except ValueError:
            pass

    media_data = schemas.MediaCreate(
        media_type="image",
        latitude=latitude,
        longitude=longitude,
        description=description,
        taken_at=parsed_date
    )

    new_media = crud.create_user_media(
        db=db, 
        media=media_data, 
        user_id=user.id, 
        filename=unique_filename, 
        filepath=file_location
    )

    return {
        "id": new_media.id,
        "filename": new_media.filename,
        "filepath": new_media.filepath,
        "media_type": new_media.media_type,
        "latitude": new_media.latitude,
        "longitude": new_media.longitude,
        "taken_at": new_media.taken_at,
        "uploaded_at": new_media.uploaded_at,
        "description": new_media.description,
        "owner_id": new_media.owner_id,
        "owner": {
            "username": user.username,
            "display_name": user.display_name,
            "icon": user.icon
        },
        "comments": [],
        "like_count": 0,
        "liked_by_me": False
    }

@router.get("/media/")
def read_media(username: str = None, db: Session = Depends(get_db)):
    """Get all media with like counts and user's like status"""
    media_list = crud.get_all_media(db)
    
    requesting_user = None
    if username:
        requesting_user = crud.get_user_by_username(db, username)
    
    result = []
    for media in media_list:
        likes_with_users = []
        for like in media.likes:
            likes_with_users.append({
                "id": like.id,
                "user_id": like.user_id,
                "user": {
                    "username": like.user.username if like.user else None,
                    "display_name": like.user.display_name if like.user else None,
                    "icon": like.user.icon if like.user else None
                }
            })
        
        comments_with_users = []
        for comment in media.comments:
            comments_with_users.append({
                "id": comment.id,
                "content": comment.content,
                "created_at": comment.created_at,
                "owner_id": comment.owner_id,
                "owner": {
                    "username": comment.owner.username if comment.owner else None,
                    "display_name": comment.owner.display_name if comment.owner else None,
                    "icon": comment.owner.icon if comment.owner else None
                }
            })
        
        media_dict = {
            "id": media.id,
            "filename": media.filename,
            "filepath": media.filepath,
            "media_type": media.media_type,
            "latitude": media.latitude,
            "longitude": media.longitude,
            "taken_at": media.taken_at,
            "uploaded_at": media.uploaded_at,
            "description": media.description,
            "owner_id": media.owner_id,
            "owner": {
                "username": media.owner.username if media.owner else None,
                "display_name": media.owner.display_name if media.owner else None,
                "icon": media.owner.icon if media.owner else None
            },
            "comments": comments_with_users,
            "like_count": len(media.likes),
            "liked_by_me": False,
            "likes": likes_with_users
        }
        
        if requesting_user:
            for like in media.likes:
                if like.user_id == requesting_user.id:
                    media_dict["liked_by_me"] = True
                    break
        
        result.append(media_dict)
    
    return result

@router.delete("/media/{media_id}")
def delete_media(
    media_id: int, 
    username: str,
    db: Session = Depends(get_db)
):
    user = crud.get_user_by_username(db, username=username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    success = crud.delete_media(db, media_id=media_id, user_id=user.id)
    if not success:
        raise HTTPException(status_code=403, detail="Not authorized or media not found")
    
    return {"message": "Deleted successfully"}

@router.delete("/admin/reset")
def reset_world(password: str = Form(...), db: Session = Depends(get_db)):
    if password != "0218":
        raise HTTPException(status_code=403, detail="Incorrect password")
    
    crud.delete_all_media(db)
    return {"message": "World reset successfully"}

# --- Comment Endpoints ---

@router.post("/comments/", response_model=schemas.Comment)
def post_comment(
    comment_data: schemas.CommentCreate,
    media_id: int,
    username: str,
    db: Session = Depends(get_db) 
):
    user = crud.get_user_by_username(db, username=username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return crud.create_comment(db=db, comment=comment_data, user_id=user.id, media_id=media_id)

@router.delete("/comments/{comment_id}")
def delete_user_comment(comment_id: int, username: str, db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    success = crud.delete_comment(db=db, comment_id=comment_id, user_id=user.id)
    if not success:
        raise HTTPException(status_code=403, detail="Could not delete comment")
    return {"message": "Comment deleted"}

# --- Like Endpoints ---

@router.post("/likes/{media_id}")
def toggle_like(media_id: int, username: str, db: Session = Depends(get_db)):
    """Toggle like status for a media item"""
    user = crud.get_user_by_username(db, username=username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    liked, like_count = crud.toggle_like(db=db, user_id=user.id, media_id=media_id)
    
    return {
        "liked": liked, 
        "like_count": like_count
    }

# Register router
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
