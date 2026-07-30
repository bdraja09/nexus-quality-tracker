# tests/test_sla_broadcaster.py
import asyncio
import json
import threading
import pytest

from app.services.sla_broadcaster import SlaBroadcaster


@pytest.mark.asyncio
async def test_broadcast_reaches_all_subscribers():
    b = SlaBroadcaster()
    b.bind_loop(asyncio.get_running_loop())
    q1, q2 = b.subscribe(), b.subscribe()

    b.publish({"nc_id": "NC-001", "alert_type": "BREACHED"})
    await asyncio.sleep(0) 

    assert json.loads(await q1.get())["nc_id"] == "NC-001"
    assert json.loads(await q2.get())["nc_id"] == "NC-001"


@pytest.mark.asyncio
async def test_publish_from_background_thread():
    """Reproduit le cas réel : APScheduler appelle publish() depuis un
    thread qui n'est pas celui de la boucle asyncio."""
    b = SlaBroadcaster()
    b.bind_loop(asyncio.get_running_loop())
    q = b.subscribe()

    def worker():
        b.publish({"nc_id": "NC-003", "alert_type": "BREACHED"})

    t = threading.Thread(target=worker)
    t.start()
    t.join()

    payload = await asyncio.wait_for(q.get(), timeout=1)
    assert "NC-003" in payload


@pytest.mark.asyncio
async def test_unsubscribe_stops_receiving():
    b = SlaBroadcaster()
    b.bind_loop(asyncio.get_running_loop())
    q = b.subscribe()
    b.unsubscribe(q)

    b.publish({"nc_id": "NC-002", "alert_type": "WARNING"})
    await asyncio.sleep(0)

    assert q.empty()