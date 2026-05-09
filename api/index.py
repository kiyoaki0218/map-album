from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import sys
import os

# 自分自身の場所（/api/index.py）からプロジェクトのルートパスを計算
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)

# パスを追加して backend を読み込めるようにする
sys.path.insert(0, PROJECT_ROOT)

from backend.main import router

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

# デバッグ用：ファイル構成を確認
@app.get("/api/debug")
def debug_info():
    return {
        "project_root": PROJECT_ROOT,
        "files_in_root": os.listdir(PROJECT_ROOT) if os.path.exists(PROJECT_ROOT) else "not found",
        "cwd": os.getcwd()
    }

# 静的ファイルの配信（VercelのFastAPI自動判定対策）
@app.get("/")
async def read_index():
    path = os.path.join(PROJECT_ROOT, "index.html")
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse(status_code=404, content={"message": "index.html not found", "path": path})

@app.get("/{file_path:path}")
async def catch_all(file_path: str):
    # api/ で始まる場合は router に任せるので、ここには来ない
    local_path = os.path.join(PROJECT_ROOT, file_path)
    if os.path.isfile(local_path):
        return FileResponse(local_path)
    
    # 見つからない場合は index.html を返す
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return JSONResponse(status_code=404, content={"message": "File not found", "tried": local_path})
