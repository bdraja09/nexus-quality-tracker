import asyncio

from fastapi import FastAPI
from fastapi.concurrency import asynccontextmanager
from app.routers import nc_router, audit_router, auth_router , corrective_action_router , root_cause_router , sla_router

from app.database import create_db_and_tables
import app.models 
from app.scheduler import start_scheduler
from app.services.sla_broadcaster import broadcaster

@asynccontextmanager
async def lifespan(app: FastAPI):
    broadcaster.bind_loop(asyncio.get_running_loop())
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.include_router(nc_router.router)
app.include_router(audit_router.router)
app.include_router(auth_router.router)
app.include_router(corrective_action_router.router)
app.include_router(root_cause_router.router)
app.include_router(sla_router.router)

@app.get("/health")
def health():
    return {"status": "ok"}