# backend/models.py
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

# Association table for Friendships (Many-to-Many self-referential)
friendship_table = Table(
    'friendships',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('friend_id', Integer, ForeignKey('users.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True) # Internal ID
    display_name = Column(String) # Japanese name
    icon = Column(String) # Icon URL/Identifier
    hashed_password = Column(String) # In a real app, hash this!
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    media_items = relationship("Media", back_populates="owner")
    comments = relationship("Comment", back_populates="owner")
    likes = relationship("Like", back_populates="user")

    
    # Friends relationship
    friends = relationship(
        "User",
        secondary=friendship_table,
        primaryjoin=id==friendship_table.c.user_id,
        secondaryjoin=id==friendship_table.c.friend_id,
        backref="friended_by"
    )



class Media(Base):
    __tablename__ = "media"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    filepath = Column(String)
    media_type = Column(String) # 'image' or 'video'
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    taken_at = Column(DateTime, nullable=True) # EXIF date or upload date
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    description = Column(String, nullable=True)
    
    owner_id = Column(Integer, ForeignKey("users.id"))

    # Relationships
    owner = relationship("User", back_populates="media_items")
    comments = relationship("Comment", back_populates="media", cascade="all, delete-orphan")
    likes = relationship("Like", back_populates="media", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    media_id = Column(Integer, ForeignKey("media.id"))
    
    owner = relationship("User", back_populates="comments")
    media = relationship("Media", back_populates="comments")

class Like(Base):
    __tablename__ = "likes"
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user_id = Column(Integer, ForeignKey("users.id"))
    media_id = Column(Integer, ForeignKey("media.id"))
    
    user = relationship("User", back_populates="likes")
    media = relationship("Media", back_populates="likes")


