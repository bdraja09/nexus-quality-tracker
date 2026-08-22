import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import (
    nc_router, audit_router, auth_router,
    corrective_action_router, root_cause_router, sla_router, export_router , department_router , notification_router
)
from app.database import create_db_and_tables
import app.models  # noqa: F401
from app.scheduler import start_scheduler
from app.services.sla_broadcaster import broadcaster



@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(create_db_and_tables)
    
    try:
        if broadcaster and hasattr(broadcaster, 'bind_loop'):
            broadcaster.bind_loop(asyncio.get_running_loop())
    except Exception as exc:
        print(f"[STARTUP] Broadcaster non initialisé : {exc}")
    
    scheduler = start_scheduler()
    
    def _startup_sla_check():
        from app.services.sla_service import check_sla_and_create_alerts
        from app.database import engine
        from sqlmodel import Session
        try:
            with Session(engine) as session:
                stats = check_sla_and_create_alerts(session)
                print(f"[STARTUP SLA CHECK] {stats}")
        except Exception as exc:
            print(f"[STARTUP SLA CHECK ERROR] {exc}")
    
    await asyncio.to_thread(_startup_sla_check)
    yield
    scheduler.shutdown()


app = FastAPI(title="Nexus 4.0 API", lifespan=lifespan)

# ─── CORS : middleware officiel ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── CORS : middleware de secours (garantit le header même en cas d'erreur) ──
@app.middleware("http")
async def cors_fallback_middleware(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin in ("http://localhost:4200", "http://127.0.0.1:4200"):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# ─── Gestionnaire global 500 avec CORS ───────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in ("http://localhost:4200", "http://127.0.0.1:4200"):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
        headers=headers,
    )

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(nc_router.router)
app.include_router(audit_router.router)
app.include_router(auth_router.router)
app.include_router(corrective_action_router.router)
app.include_router(root_cause_router.router)
app.include_router(sla_router.router)
app.include_router(export_router.router)
app.include_router(department_router.router)
app.include_router(notification_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/ml")
def health_ml():
    from app.services.delay_risk_service import delay_risk_service
    return delay_risk_service.healthcheck()