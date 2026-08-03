from app.models.sla_alert import SlaAlert


def test_sla_alert_model_imports():
    assert SlaAlert.__tablename__ == "sla_alerts"
