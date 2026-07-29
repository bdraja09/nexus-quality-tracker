from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session

from app.database import engine
from app.services.sla_service import check_sla_and_create_alerts


def _run_sla_job():
    """Wrapper qui crée une session DB pour le job."""
    with Session(engine) as session:
        stats = check_sla_and_create_alerts(session)
        print(f"[SLA Job] {stats['total_checked']} NC scannées — "
              f"{stats['warning']} warning(s), {stats['breached']} breached")


def start_scheduler():
    """Démarre le planificateur au lancement de l'application."""
    scheduler = BackgroundScheduler()
    
    scheduler.add_job(
        _run_sla_job,
        trigger=CronTrigger(minute=0), 
        id="sla_check_hourly",
        replace_existing=True
    )
    
    scheduler.add_job(
        _run_sla_job,
        trigger="date",  
        id="sla_check_startup",
        replace_existing=True
    )
    
    scheduler.start()
    print("[Scheduler] Job SLA démarré (toutes les heures)")
    return scheduler