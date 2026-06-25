from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.db import init_db
from app.api.api import api_router
from app.services.migrations import run_alembic_upgrade_head
from app.services.scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lógica de inicio: Inicializar base de datos y crear tablas
    try:
        if settings.RUN_MIGRATIONS_ON_STARTUP:
            run_alembic_upgrade_head()
        else:
            init_db()
        print("Base de datos inicializada exitosamente.")
        start_scheduler()
    except Exception as e:
        print(f"Error al inicializar la base de datos: {e}")
    yield
    stop_scheduler()
    # Lógica de apagado (si se requiere)

app = FastAPI(
    title="POS Multi-Tenant API",
    description="Backend API para el Sistema POS Multi-Tenant",
    version="1.0.0",
    lifespan=lifespan
)

# Configuración de CORS para permitir la conexión desde el Frontend en React
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enrutadores de la API
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message": "POS Multi-Tenant API funcionando correctamente"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
