from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

APP_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = (APP_ROOT.parent / "frontend").resolve()
DATA_DIR = (APP_ROOT / "data").resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = DATA_DIR / "db.json"

app = FastAPI(title="EduFAD API", version="1.1.0")

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")

def _load_db() -> Dict[str, Any]:
    if not DB_FILE.exists():
        return {"profiles": []}
    return json.loads(DB_FILE.read_text(encoding="utf-8"))

def _save_db(db: Dict[str, Any]) -> None:
    DB_FILE.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

class ProfileIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    date_of_birth: str = Field(..., description="YYYY-MM-DD (obbligatoria)")

class Profile(ProfileIn):
    id: str

@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "app": "EduFAD", "version": "1.1.0"}

@app.get("/api/profiles", response_model=List[Profile])
def list_profiles() -> List[Profile]:
    db = _load_db()
    return db.get("profiles", [])

@app.post("/api/profiles", response_model=Profile)
def create_profile(payload: ProfileIn) -> Profile:
    db = _load_db()
    profiles: List[Dict[str, Any]] = db.setdefault("profiles", [])
    new_id = f"p{len(profiles)+1:05d}"
    p = {"id": new_id, **payload.model_dump()}
    profiles.append(p)
    _save_db(db)
    return p

@app.get("/")
def root() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))
