from fastapi import FastAPI
from app.routers import nc_router, audit_router, auth_router , corrective_action_router , root_cause_router

from app.database import create_db_and_tables
import app.models  # important : force l'import de tous les modèles

app = FastAPI(title="Nexus P3 - Quality Module")

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.include_router(nc_router.router)
app.include_router(audit_router.router)
app.include_router(auth_router.router)
app.include_router(corrective_action_router.router)
app.include_router(root_cause_router.router)

@app.get("/health")
def health():
    return {"status": "ok"}