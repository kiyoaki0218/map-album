from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# プロジェクトルートをパスに追加
path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)

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

# ルーターを登録（backend.main 内で router に prefix="/api" が付いている前提）
app.include_router(router)

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
