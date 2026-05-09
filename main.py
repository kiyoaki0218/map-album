from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# APIルーターを登録（全てのAPIを /api 接頭辞で提供）
app.include_router(router)

# ルートアクセス時の死活監視用
@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
