import os
from sqlmodel import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nexus_user:motdepasse_solide@localhost:5432/nexus_p3"
)

print(f"Connexion à : {DATABASE_URL.replace('://', '://***:***@')}")
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS notification CASCADE"))
    conn.execute(text("""
        CREATE TABLE notification (
            id SERIAL PRIMARY KEY,
            recipient_id VARCHAR NOT NULL,
            nc_id VARCHAR,
            ref_code VARCHAR,
            type VARCHAR NOT NULL,
            title VARCHAR NOT NULL,
            message VARCHAR NOT NULL,
            reason VARCHAR,
            channel VARCHAR DEFAULT 'in_app',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMP,
            deleted_at TIMESTAMP
        )
    """))
    conn.execute(text("CREATE INDEX idx_notif_recipient ON notification(recipient_id)"))
    conn.execute(text("CREATE INDEX idx_notif_nc ON notification(nc_id)"))
    conn.execute(text("CREATE INDEX idx_notif_deleted ON notification(deleted_at)"))
    conn.commit()
    print("✅ Table 'notification' recréée.")