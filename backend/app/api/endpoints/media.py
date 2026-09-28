import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.user import User

router = APIRouter()

# El navegador ya entrega la foto redimensionada y comprimida (utils/imageUpload.ts).
# Aquí solo se valida por firma de bytes (no por el Content-Type que manda el
# cliente) y se guarda con un nombre aleatorio, así nunca se sobrescribe un
# archivo y se puede servir con caché inmutable.
_SIGNATURES = {
    "webp": lambda head: head[:4] == b"RIFF" and head[8:12] == b"WEBP",
    "jpg": lambda head: head[:3] == b"\xff\xd8\xff",
}


def media_root() -> Path:
    root = Path(settings.MEDIA_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requieren permisos de administrador para subir fotos",
        )

    data = await file.read(settings.MEDIA_MAX_UPLOAD_BYTES + 1)
    if len(data) > settings.MEDIA_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La foto es demasiado grande",
        )

    extension = next((ext for ext, matches in _SIGNATURES.items() if matches(data[:12])), None)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato no soportado: solo WebP o JPEG",
        )

    tenant_dir = media_root() / str(current_user.tenant_id)
    tenant_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{extension}"
    (tenant_dir / filename).write_bytes(data)

    # Ruta relativa al backend; el frontend la resuelve contra su API_URL.
    return {"path": f"/media/{current_user.tenant_id}/{filename}", "bytes": len(data)}
