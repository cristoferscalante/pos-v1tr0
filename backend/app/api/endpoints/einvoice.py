from typing import Literal, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import get_current_user
from app.models.user import User
from app.services.factus import FactusService


router = APIRouter()


class FactusCredentials(BaseModel):
    environment: Literal["sandbox", "production"] = "sandbox"
    client_id: str
    client_secret: str
    username: EmailStr
    password: str


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores",
        )
    return current_user


@router.post("/factus/test-connection")
async def test_factus_connection(
    credentials: FactusCredentials,
    _: User = Depends(require_admin),
):
    try:
        token_data = await FactusService.authenticate(**credentials.model_dump())
        company_data = await FactusService.get_company(
            environment=credentials.environment,
            access_token=token_data["access_token"],
        )
        return {
            "status": "ok",
            "provider": "factus",
            "environment": credentials.environment,
            "token_type": token_data.get("token_type"),
            "expires_in": token_data.get("expires_in"),
            "company": company_data,
        }
    except httpx.HTTPStatusError as exc:
        detail = _extract_factus_error(exc.response)
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo conectar con Factus: {exc}",
        ) from exc


@router.post("/factus/numbering-ranges")
async def get_factus_numbering_ranges(
    credentials: FactusCredentials,
    _: User = Depends(require_admin),
):
    try:
        token_data = await FactusService.authenticate(**credentials.model_dump())
        ranges_data = await FactusService.get_numbering_ranges(
            environment=credentials.environment,
            access_token=token_data["access_token"],
        )
        return {
            "status": "ok",
            "provider": "factus",
            "environment": credentials.environment,
            "ranges": ranges_data,
        }
    except httpx.HTTPStatusError as exc:
        detail = _extract_factus_error(exc.response)
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo consultar Factus: {exc}",
        ) from exc


def _extract_factus_error(response: httpx.Response) -> Any:
    try:
        payload = response.json()
        return payload.get("message") or payload.get("error") or payload
    except Exception:
        return response.text or "Error desconocido al consultar Factus"
