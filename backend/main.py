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

# --- KC Proxy Endpoint ---
from fastapi import Request

@router.post("/kc-proxy/send")
async def proxy_kc_send(request: Request):
    try:
        payload = await request.json()
        kc_server_url = os.environ.get("KC_SERVER_URL", "https://kc-server.vercel.app")
        # Ensure url does not end with /
        if kc_server_url.endswith('/'):
            kc_server_url = kc_server_url[:-1]
            
        res = requests.post(f'{kc_server_url}/api/send', json=payload)
        
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
            
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- KC Bonus Helpers ---
import base64
import hashlib
import time
import requests

def send_kc_bonus(to_address: str, amount: int):
    kc_secret_b64 = os.getenv("KC_SYSTEM_SECRET")
    if not kc_secret_b64:
        print("KC_SYSTEM_SECRET not set")
        return None
        
    try:
        import nacl.signing
        secret_bytes = base64.b64decode(kc_secret_b64)
        seed = secret_bytes[:32]
        
        signing_key = nacl.signing.SigningKey(seed)
        verify_key = signing_key.verify_key
        
        public_key_b64 = base64.b64encode(verify_key.encode()).decode('utf-8')
        
        m = hashlib.sha256()
        m.update(verify_key.encode())
        from_address = m.hexdigest()[:40]
        
        nonce_str = str(int(time.time() * 1000))
        amount_str = str(amount)
        
        msg_str = f"{from_address}:{to_address}:{amount_str}:{nonce_str}"
        msg_bytes = msg_str.encode('utf-8')
        
        signed = signing_key.sign(msg_bytes)
        signature_b64 = base64.b64encode(signed.signature).decode('utf-8')
        
        payload = {
            "from": from_address,
            "to": to_address,
            "amount": amount_str,
            "nonce": nonce_str,
            "signature": signature_b64,
            "publicKey": public_key_b64
        }
        
        kc_server_url = os.environ.get("KC_SERVER_URL", "https://kc-server.vercel.app")
        if kc_server_url.endswith('/'):
            kc_server_url = kc_server_url[:-1]
            
        res = requests.post(f'{kc_server_url}/api/send', json=payload)
        if res.status_code == 200:
            return res.json().get("txId")
        else:
            print(f"KC Server error: {res.text}")
            return None
    except Exception as e:
        print(f"KC Bonus Error: {e}")
        return None

def process_region_bonus(db: Session, user, latitude: float, longitude: float):
    if not user.kc_address or latitude is None or longitude is None:
        return
        
    try:
        from geopy.geocoders import Nominatim
        geolocator = Nominatim(user_agent="mapalbum_kc_integration")
        location = geolocator.reverse((latitude, longitude), exactly_one=True, language="ja")
        
        if not location or not location.raw.get("address"):
            return
            
        address = location.raw["address"]
        region_name = address.get("city") or address.get("town") or address.get("county") or address.get("village")
        if not region_name:
            return
            
        country = address.get("country_code", "unknown")
        
        visited = db.query(models.VisitedRegion).filter(
            models.VisitedRegion.user_id == user.id,
            models.VisitedRegion.region_name == region_name,
            models.VisitedRegion.country_code == country
        ).first()
        
        if not visited:
            new_visit = models.VisitedRegion(
                user_id=user.id,
                region_name=region_name,
                country_code=country
            )
            db.add(new_visit)
            db.commit()
            db.refresh(new_visit)
            
            tx_id = send_kc_bonus(user.kc_address, 10000)
            if tx_id:
                bonus_log = models.KcBonusLog(
                    user_id=user.id,
                    region_id=new_visit.id,
                    amount=10000,
                    tx_id=tx_id
                )
                db.add(bonus_log)
                db.commit()
    except Exception as e:
        print(f"Region processing error: {e}")

# --- User Endpoints ---

@router.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    
    if db_user:
        updated_user = crud.update_user_profile(
            db=db, 
            user_id=db_user.id, 
            display_name=user.display_name, 
            icon=user.icon,
            kc_address=user.kc_address
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
    is_secret: bool = Form(False),
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
        taken_at=parsed_date,
        is_secret=is_secret,
        secret_price=10000000 if is_secret else 0
    )

    new_media = crud.create_user_media(
        db=db, 
        media=media_data, 
        user_id=user.id, 
        filename=unique_filename, 
        filepath=file_location
    )

    # Process KC Region Bonus asynchronously (or synchronously for now)
    try:
        import threading
        # Run in background to avoid blocking the upload response
        threading.Thread(target=process_region_bonus, args=(db, user, latitude, longitude)).start()
    except Exception as e:
        print(f"Failed to start region bonus thread: {e}")

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
            "icon": user.icon,
            "kc_address": user.kc_address
        },
        "is_secret": new_media.is_secret,
        "secret_price": new_media.secret_price,
        "comments": [],
        "like_count": 0,
        "liked_by_me": False,
        "unlocked_by_me": True

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
        
        unlocked = False
        if requesting_user:
            if media.owner_id == requesting_user.id:
                unlocked = True
            else:
                unlock_record = db.query(models.SecretPhotoUnlock).filter(
                    models.SecretPhotoUnlock.media_id == media.id,
                    models.SecretPhotoUnlock.user_id == requesting_user.id
                ).first()
                if unlock_record:
                    unlocked = True
                    
        filepath = media.filepath
        if media.is_secret and not unlocked:
            if "upload/" in filepath:
                filepath = filepath.replace("upload/", "upload/e_blur:1000/")
                
        media_dict = {
            "id": media.id,
            "filename": media.filename,
            "filepath": filepath,
            "media_type": media.media_type,
            "latitude": media.latitude,
            "longitude": media.longitude,
            "taken_at": media.taken_at,
            "uploaded_at": media.uploaded_at,
            "description": media.description,
            "is_secret": media.is_secret,
            "secret_price": media.secret_price,
            "owner_id": media.owner_id,
            "owner": {
                "username": media.owner.username if media.owner else None,
                "display_name": media.owner.display_name if media.owner else None,
                "icon": media.owner.icon if media.owner else None,
                "kc_address": media.owner.kc_address if media.owner else None
            },
            "comments": comments_with_users,
            "like_count": len(media.likes),
            "liked_by_me": False,
            "unlocked_by_me": unlocked,
            "likes": likes_with_users
        }
        
        if requesting_user:
            for like in media.likes:
                if like.user_id == requesting_user.id:
                    media_dict["liked_by_me"] = True
                    break
        
        result.append(media_dict)
    
    return result

@router.post("/media/{media_id}/unlock")
def unlock_secret_media(media_id: int, request: schemas.UnlockRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=request.username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    media = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
        
    # Check if already unlocked
    existing = db.query(models.SecretPhotoUnlock).filter(
        models.SecretPhotoUnlock.media_id == media_id,
        models.SecretPhotoUnlock.user_id == user.id
    ).first()
    
    if not existing:
        new_unlock = models.SecretPhotoUnlock(
            user_id=user.id,
            media_id=media_id,
            tx_id=request.tx_id
        )
        db.add(new_unlock)
        db.commit()
        
    return {"status": "success"}

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
