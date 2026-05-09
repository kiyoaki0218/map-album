-- MapAlbum Supabase Schema
-- Supabase の SQL エディタで実行してテーブルを作成してください

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR UNIQUE NOT NULL,
    display_name VARCHAR,
    icon VARCHAR,
    hashed_password VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);
CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

-- フレンドシップテーブル（多対多 自己参照）
CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER REFERENCES users(id),
    friend_id INTEGER REFERENCES users(id),
    PRIMARY KEY (user_id, friend_id)
);

-- メディア（写真）テーブル
CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    filename VARCHAR,
    filepath VARCHAR,
    media_type VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    taken_at TIMESTAMP,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    description VARCHAR,
    owner_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ix_media_id ON media (id);
CREATE INDEX IF NOT EXISTS ix_media_filename ON media (filename);

-- コメントテーブル
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    owner_id INTEGER REFERENCES users(id),
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_comments_id ON comments (id);

-- いいねテーブル
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id INTEGER REFERENCES users(id),
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_likes_id ON likes (id);
