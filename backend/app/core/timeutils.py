"""Hora del negocio.

En la base todo se guarda en UTC sin zona (datetime.utcnow). Los negocios
operan en Colombia (UTC-5, sin horario de verano), así que "hoy", "esta
semana" y "este mes" deben empezar a medianoche de Colombia y no a las
7:00 p. m. del día anterior, que es la medianoche UTC.
"""
from datetime import datetime, timedelta, timezone

BUSINESS_UTC_OFFSET = timedelta(hours=-5)  # America/Bogota


def to_naive_utc(value: datetime) -> datetime:
    """Normaliza una fecha (con o sin zona) a UTC sin zona, como se guarda en la base."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def utc_to_local(value: datetime) -> datetime:
    return to_naive_utc(value) + BUSINESS_UTC_OFFSET


def local_to_utc(value: datetime) -> datetime:
    return value - BUSINESS_UTC_OFFSET


def local_now() -> datetime:
    return utc_to_local(datetime.utcnow())


def local_day_start(local: datetime) -> datetime:
    return local.replace(hour=0, minute=0, second=0, microsecond=0)
