-- Map Album に KC 連携機能を追加するためのマイグレーション
-- ユーザーの最新案に基づく拡張

-- 1. ユーザーテーブルに KC アドレスを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS kc_address VARCHAR(40);
CREATE INDEX IF NOT EXISTS ix_users_kc_address ON users (kc_address);

-- 2. メディア（写真）テーブルにシークレット設定を追加
ALTER TABLE media ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;
ALTER TABLE media ADD COLUMN IF NOT EXISTS secret_price BIGINT DEFAULT 10000000; -- 内部単位 (100 KC * 10^5)

-- 3. 写真閲覧権の購入記録テーブル
-- シークレット写真のロック解除状態を管理
CREATE TABLE IF NOT EXISTS secret_photo_unlocks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    media_id INTEGER REFERENCES media(id),
    tx_id VARCHAR(16), -- KC 側での取引ID
    unlocked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, media_id)
);

-- 4. 取得済み地域（市・郡）の記録テーブル
-- 新規地域ボーナス判定用
CREATE TABLE IF NOT EXISTS visited_regions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    region_name VARCHAR(255), -- 例: "東京都新宿区", "New York County"
    country_code VARCHAR(10),  -- 例: "JP", "US"
    first_visited_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, region_name, country_code)
);

-- 5. ボーナス付与履歴
CREATE TABLE IF NOT EXISTS kc_bonus_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    region_id INTEGER REFERENCES visited_regions(id),
    amount BIGINT,
    tx_id VARCHAR(16),
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON COLUMN media.is_secret IS '100 KC 支払わないと見れない写真かどうか';
COMMENT ON TABLE visited_regions IS '新規地域ボーナスの重複付与を防ぐための訪問履歴';
