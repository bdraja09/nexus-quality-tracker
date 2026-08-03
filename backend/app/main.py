import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    nc_router, audit_router, auth_router,
    corrective_action_router, root_cause_router, sla_router
)
from app.database import create_db_and_tables
import app.models
from app.scheduler import start_scheduler
from app.services.sla_broadcaster import broadcaster


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Crée les tables (y compris sla_alerts) — wrap synchrone dans thread
    await asyncio.to_thread(create_db_and_tables)
    
    # 2. Démarre le broadcaster si tu l'utilises
    broadcaster.bind_loop(asyncio.get_running_loop())
    
    # 3. Démarre le scheduler APScheduler
    scheduler = start_scheduler()
    
    # 4. Déclenche immédiatement un check SLA au démarrage
    from app.services.sla_service import check_sla_and_create_alerts
    from app.database import engine
    from sqlmodel import Session
    with Session(engine) as session:
        stats = check_sla_and_create_alerts(session)
        print(f"[STARTUP SLA CHECK] {stats}")
    
    yield
    
    # Shutdown
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nc_router.router)
app.include_router(audit_router.router)
app.include_router(auth_router.router)
app.include_router(corrective_action_router.router)
app.include_router(root_cause_router.router)
app.include_router(sla_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}