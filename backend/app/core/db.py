import re
import unicodedata
from sqlmodel import create_engine, SQLModel, Session, select, text

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL

# Si es SQLite, necesitamos connect_args={"check_same_thread": False} para permitir accesos concurrentes
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, echo=settings.LOG_SQL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, echo=settings.LOG_SQL)

def slugify(value: str) -> str:
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    return re.sub(r'[-\s]+', '-', value).strip('-_')

def init_db():
    # Crea las tablas en la base de datos si no existen (con reintentos)
    import time
    from sqlalchemy.exc import OperationalError
    from app import models  # noqa: F401
    
    for attempt in range(5):
        try:
            SQLModel.metadata.create_all(engine)
            break
        except OperationalError as e:
            if attempt == 4:
                raise e
            print(f"Base de datos no lista. Reintentando en 3 segundos... (Intento {attempt+1}/5)")
            time.sleep(3)
    
    # Migrar la base de datos agregando la columna 'slug' si no existe
    with Session(engine) as session:
        if DATABASE_URL.startswith("postgresql"):
            try:
                session.execute(text("ALTER TABLE tenant ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;"))
                session.execute(text("ALTER TABLE sale ADD COLUMN IF NOT EXISTS cash_session_id UUID;"))
                session.commit()
            except Exception as e:
                print(f"Error migrando base de datos PostgreSQL: {e}")
                session.rollback()
        else:
            try:
                session.execute(text("ALTER TABLE tenant ADD COLUMN slug VARCHAR(255);"))
                session.commit()
            except Exception as e:
                print(f"Intento de agregar columna slug en SQLite: {e}")
                session.rollback()
            try:
                session.execute(text("ALTER TABLE sale ADD COLUMN cash_session_id VARCHAR(36);"))
                session.commit()
            except Exception as e:
                print(f"Intento de agregar columna cash_session_id en SQLite: {e}")
                session.rollback()

        # Rellenar slugs vacíos para inquilinos existentes
        from app.models.tenant import Tenant
        tenants = session.exec(select(Tenant)).all()
        for tenant in tenants:
            if not tenant.slug:
                base_slug = slugify(tenant.name or "negocio")
                slug = base_slug
                counter = 1
                while session.exec(select(Tenant).where(Tenant.slug == slug)).first():
                    slug = f"{base_slug}-{counter}"
                    counter += 1
                tenant.slug = slug
                session.add(tenant)
        session.commit()

def get_session():
    with Session(engine) as session:
        yield session
