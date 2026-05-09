from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from backend.main import router
import os

# プロジェクトのルートディレクトリを取得
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Map Album API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# エラーハンドリング（デバッグ用：エラー内容を画面に表示）
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)},
    )

# APIルーターを登録
app.include_router(router)

# /api/health
@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

# 静的ファイルの配信設定
@app.get("/")
async def read_index():
    index_path = os.path.join(BASE_DIR, "public", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"message": "index.html not found", "path": index_path})

@app.get("/{file_path:path}")
async def catch_all(file_path: str):
    local_path = os.path.join(BASE_DIR, "public", file_path)
    if os.path.isfile(local_path):
        return FileResponse(local_path)
    
    # ファイルが見つからない場合は index.html を返す
    index_path = os.path.join(BASE_DIR, "public", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"message": "File not found"})
