from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.main import router
import os

app = FastAPI(title="Map Album API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# APIルーターを登録
app.include_router(router)

# /api/health
@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

# 静的ファイルの配信設定
# 1. / へのアクセスで index.html を返す
@app.get("/")
async def read_index():
    return FileResponse(os.path.join("public", "index.html"))

# 2. その他の静的ファイル（CSS/JSなど）を /public 配下としてマウント
# またはルート直下から探せるように個別設定
@app.get("/{file_path:path}")
async def catch_all(file_path: str):
    # public フォルダ内にファイルがあればそれを返す
    local_path = os.path.join("public", file_path)
    if os.path.isfile(local_path):
        return FileResponse(local_path)
    # なければ index.html を返す（SPA的な挙動）
    return FileResponse(os.path.join("public", "index.html"))
