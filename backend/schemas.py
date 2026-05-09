# backend/schemas.py
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

# User Schemas (Forward declaration or split)
class UserPublic(BaseModel):
    username: str
    display_name: str
    icon: str

    class Config:
        orm_mode = True

# class ShopItem(BaseModel):
#     id: str
#     name: str
#     description: str
#     cost: int
#     icon: str # emoji or url

# Comment Schemas
class CommentBase(BaseModel):
    content: str

class CommentCreate(CommentBase):
    pass

class Comment(CommentBase):
    id: int
    created_at: datetime
    owner_id: int
    owner: UserPublic
    
    class Config:
        orm_mode = True

# Like Schemas
class LikeBase(BaseModel):
    pass

class LikeCreate(LikeBase):
    pass

class Like(LikeBase):
    id: int
    user_id: int
    media_id: int
    created_at: datetime
    user: UserPublic
    
    class Config:
        orm_mode = True

# Media Schemas
class MediaBase(BaseModel):
    media_type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    taken_at: Optional[datetime] = None

class MediaCreate(MediaBase):
    pass

class Media(MediaBase):
    id: int
    filename: str
    filepath: str
    uploaded_at: datetime
    owner_id: int
    owner: UserPublic
    comments: List[Comment] = []
    like_count: int = 0  # Computed field
    liked_by_me: bool = False  # Computed field for current user

    
    # Custom config to allow ORM objects
    class Config:
        orm_mode = True

# User Schemas
class UserBase(BaseModel):
    username: str
    display_name: str
    icon: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: datetime
    media_items: List[Media] = []

    class Config:
        orm_mode = True

# Token Schema (for simple auth later)
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None


