"""Límite de intentos en memoria para los endpoints públicos de autenticación.

Antes login, registro y recuperación de contraseña aceptaban intentos sin límite:
se podían probar contraseñas por fuerza bruta o inundar de correos a un usuario.
El backend corre con un solo proceso uvicorn, así que un contador en memoria
basta; si algún día se escala a varios workers hay que moverlo a Redis.
"""
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque] = {}


def client_ip(request: Request) -> str:
    # El tráfico llega por Cloudflare -> Caddy -> backend, así que la IP del
    # socket siempre es la de Caddy. Cloudflare manda la IP real del cliente.
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip()
    if ip:
        return ip
    return request.client.host if request.client else "desconocida"


def check_rate_limit(key: str, max_hits: int, window_seconds: int) -> None:
    """Registra un intento para `key` y lanza 429 si supera `max_hits` en la ventana."""
    now = time.monotonic()
    with _lock:
        bucket = _hits.setdefault(key, deque())
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_hits:
            retry_after = int(window_seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        # Limpieza ocasional para que el diccionario no crezca sin fin
        if len(_hits) > 10_000:
            for stale_key in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(stale_key, None)
