from datetime import datetime, timedelta
from typing import List
from sqlmodel import Session, select

from app.models.non_conformance import NonConformance
from app.models.sla_alert import SlaAlert
from app.enums import NCState


def check_sla_and_create_alerts(session: Session) -> dict:
    """
    Job périodique : scanne toutes les NC non terminées et crée des alertes.
    Retourne un résumé {warning: N, breached: N, total_checked: N}
    """
    now = datetime.utcnow()
    tomorrow = now + timedelta(days=1)
    
    # Récupère toutes les NC non clôturées/rejetées
    stmt = select(NonConformance).where(
        NonConformance.current_state.not_in([
            NCState.CLOSED.value,
            NCState.REJECTED.value
        ]),
        NonConformance.is_deleted == False
    )
    open_ncs = session.exec(stmt).all()
    
    stats = {"warning": 0, "breached": 0, "total_checked": len(open_ncs)}
    
    for nc in open_ncs:
        if not nc.due_date:
            continue  
            
        due = datetime.combine(nc.due_date, datetime.min.time())
        
        # ─── BREACHED : déjà dépassée ───
        if due < now:
            existing = session.exec(
                select(SlaAlert).where(
                    SlaAlert.nc_id == nc.id_nc,
                    SlaAlert.alert_type == "BREACHED",
                    SlaAlert.resolved_at == None
                )
            ).first()
            
            if not existing:
                alert = SlaAlert(nc_id=nc.id_nc, alert_type="BREACHED")
                session.add(alert)
                stats["breached"] += 1
        
        # ─── WARNING : échéance dans moins de 24h ───
        elif due <= tomorrow:
            existing = session.exec(
                select(SlaAlert).where(
                    SlaAlert.nc_id == nc.id_nc,
                    SlaAlert.alert_type == "WARNING",
                    SlaAlert.resolved_at == None
                )
            ).first()
            
            if not existing:
                alert = SlaAlert(nc_id=nc.id_nc, alert_type="WARNING")
                session.add(alert)
                stats["warning"] += 1
    
    session.commit()
    return stats


def get_active_alerts(session: Session) -> List[SlaAlert]:
    """Retourne toutes les alertes non résolues, triées par gravité."""
    stmt = select(SlaAlert).where(
        SlaAlert.resolved_at == None
    ).order_by(
        SlaAlert.alert_type.desc(),  
        SlaAlert.created_at.desc()
    )
    return session.exec(stmt).all()


def resolve_alerts_for_nc(session: Session, nc_id: str):
    """Marque les alertes d'une NC comme résolues quand elle est clôturée."""
    stmt = select(SlaAlert).where(
        SlaAlert.nc_id == nc_id,
        SlaAlert.resolved_at == None
    )
    alerts = session.exec(stmt).all()
    for alert in alerts:
        alert.resolved_at = datetime.utcnow()
    session.commit()