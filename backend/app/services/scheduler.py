from datetime import datetime, timedelta
import threading

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models.product import Product
from app.models.sale import Sale
from app.models.tenant import Tenant
from app.services.notifications import notify_daily_summary


_scheduler_thread: threading.Thread | None = None
_scheduler_stop = threading.Event()


def _seconds_until_next_run() -> float:
    now = datetime.utcnow()
    target = now.replace(hour=settings.DAILY_SUMMARY_HOUR_UTC, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return max((target - now).total_seconds(), 60.0)


def _build_summary(session: Session, tenant_id) -> dict:
    now = datetime.utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    sales = session.exec(
        select(Sale).where(Sale.tenant_id == tenant_id, Sale.created_at >= day_start, Sale.created_at < now)
    ).all()
    products = session.exec(select(Product).where(Product.tenant_id == tenant_id)).all()
    costs = {product.id: float(product.cost) for product in products}

    revenue = float(sum(sale.total for sale in sales))
    profit = 0.0
    for sale in sales:
        for detail in sale.details:
            profit += float(detail.total) - (costs.get(detail.product_id, 0.0) * detail.quantity)

    return {
        "sales_count": len(sales),
        "revenue": round(revenue, 2),
        "profit": round(profit, 2),
    }


def run_daily_summary_once() -> None:
    with Session(engine) as session:
        tenants = session.exec(select(Tenant)).all()
        for tenant in tenants:
            try:
                notify_daily_summary(session, tenant.id, _build_summary(session, tenant.id))
            except Exception as exc:
                print(f"Error enviando resumen diario para {tenant.id}: {exc}")


def _loop() -> None:
    while not _scheduler_stop.is_set():
        if _scheduler_stop.wait(_seconds_until_next_run()):
            break
        run_daily_summary_once()


def start_scheduler() -> None:
    global _scheduler_thread
    if not settings.SCHEDULER_ENABLED:
        return
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_loop, name="daily-summary-scheduler", daemon=True)
    _scheduler_thread.start()


def stop_scheduler() -> None:
    _scheduler_stop.set()
