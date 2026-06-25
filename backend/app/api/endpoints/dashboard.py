from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
from datetime import datetime, timedelta
import uuid

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.cash_session import CashSession
from app.models.user import User
from app.models.sale import Sale, SaleDetail
from app.models.product import Product

router = APIRouter()


@router.get("/summary")
def get_dashboard_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido: se requieren permisos de administrador"
        )
    tenant_id = current_user.tenant_id
    """
    Retorna los KPIs principales del negocio:
    - Ventas del día, semana y mes
    - Ingresos del día, semana y mes
    - Ticket promedio
    - Productos con stock bajo (< 5 unidades)
    - Ventas por método de pago
    """
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    # Consultar todas las ventas del tenant (mes actual para optimizar)
    all_sales = session.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= month_start
        )
    ).all()

    # Obtener mapa de costos de productos del tenant para calcular ganancias de forma óptima
    products_db = session.exec(select(Product).where(Product.tenant_id == tenant_id)).all()
    product_costs = {p.id: float(p.cost) for p in products_db}

    def calculate_sales_profit(sales_list) -> float:
        total_profit = 0.0
        for s in sales_list:
            for detail in s.details:
                cost = product_costs.get(detail.product_id, 0.0)
                total_profit += float(detail.total) - (cost * detail.quantity)
        return total_profit

    # Calcular KPIs
    sales_today = [s for s in all_sales if s.created_at >= today_start]
    sales_week = [s for s in all_sales if s.created_at >= week_start]
    sales_month = all_sales

    count_today = len(sales_today)
    count_week = len(sales_week)
    count_month = len(sales_month)

    revenue_today = float(sum(s.total for s in sales_today))
    revenue_week = float(sum(s.total for s in sales_week))
    revenue_month = float(sum(s.total for s in sales_month))

    profit_today = calculate_sales_profit(sales_today)
    profit_week = calculate_sales_profit(sales_week)
    profit_month = calculate_sales_profit(sales_month)

    avg_ticket = revenue_month / count_month if count_month > 0 else 0.0

    # Productos con stock bajo
    low_stock_products = session.exec(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.stock < 5
        )
    ).all()

    # Ventas por método de pago (mes actual)
    payment_breakdown: Dict[str, int] = {}
    for s in sales_month:
        payment_breakdown[s.payment_method] = payment_breakdown.get(s.payment_method, 0) + 1

    open_cash_session = session.exec(
        select(CashSession).where(
            CashSession.tenant_id == tenant_id,
            CashSession.status == "open",
        )
    ).first()

    current_cash_session = None
    if open_cash_session:
        open_sales = session.exec(select(Sale).where(Sale.cash_session_id == open_cash_session.id)).all()
        sales_total = float(sum(s.total for s in open_sales))
        current_cash_session = {
            "id": str(open_cash_session.id),
            "opened_at": open_cash_session.opened_at.isoformat(),
            "opening_amount": float(open_cash_session.opening_amount),
            "sales_count": len(open_sales),
            "sales_total": round(sales_total, 2),
            "expected_amount": round(float(open_cash_session.opening_amount) + sales_total, 2),
        }

    return {
        "counts": {
            "today": count_today,
            "week": count_week,
            "month": count_month,
        },
        "revenue": {
            "today": round(revenue_today, 2),
            "week": round(revenue_week, 2),
            "month": round(revenue_month, 2),
        },
        "profit": {
            "today": round(profit_today, 2),
            "week": round(profit_week, 2),
            "month": round(profit_month, 2),
        },
        "avg_ticket": round(avg_ticket, 2),
        "low_stock_count": len(low_stock_products),
        "low_stock_products": [
            {"id": str(p.id), "name": p.name, "stock": p.stock}
            for p in low_stock_products[:5]
        ],
        "payment_breakdown": payment_breakdown,
        "current_cash_session": current_cash_session,
    }


@router.get("/chart")
def get_sales_chart(
    days: int = 7,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido: se requieren permisos de administrador"
        )
    tenant_id = current_user.tenant_id
    """
    Retorna datos de ventas agrupados por día para el gráfico.
    Por defecto devuelve los últimos 7 días.
    """
    now = datetime.utcnow()
    start_date = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    sales = session.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= start_date
        )
    ).all()

    # Agrupar por día
    chart_data: Dict[str, Dict] = {}
    for i in range(days):
        day = (start_date + timedelta(days=i)).date()
        chart_data[str(day)] = {
            "date": str(day),
            "label": (start_date + timedelta(days=i)).strftime("%d/%m"),
            "count": 0,
            "revenue": 0.0,
        }

    for sale in sales:
        day_key = str(sale.created_at.date())
        if day_key in chart_data:
            chart_data[day_key]["count"] += 1
            chart_data[day_key]["revenue"] += float(sale.total)

    return list(chart_data.values())


@router.get("/top-products")
def get_top_products(
    limit: int = 5,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido: se requieren permisos de administrador"
        )
    tenant_id = current_user.tenant_id
    """
    Retorna los productos más vendidos (por cantidad) del mes actual.
    """
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Ventas del mes para este tenant
    sales_ids = [
        s.id for s in session.exec(
            select(Sale).where(
                Sale.tenant_id == tenant_id,
                Sale.created_at >= month_start
            )
        ).all()
    ]

    if not sales_ids:
        return []

    # Obtener detalles de esas ventas
    details = session.exec(
        select(SaleDetail).where(
            SaleDetail.sale_id.in_(sales_ids)  # type: ignore
        )
    ).all()

    # Agregar por producto
    product_totals: Dict[str, Dict] = {}
    for detail in details:
        pid = str(detail.product_id)
        if pid not in product_totals:
            product_totals[pid] = {"product_id": pid, "quantity": 0, "revenue": 0.0}
        product_totals[pid]["quantity"] += detail.quantity
        product_totals[pid]["revenue"] += float(detail.total)

    # Ordenar por cantidad vendida
    sorted_products = sorted(
        product_totals.values(),
        key=lambda x: x["quantity"],
        reverse=True
    )[:limit]

    # Enriquecer con nombre del producto
    result = []
    for item in sorted_products:
        product = session.get(Product, uuid.UUID(item["product_id"]))
        result.append({
            "product_id": item["product_id"],
            "name": product.name if product else "Desconocido",
            "quantity_sold": item["quantity"],
            "revenue": round(item["revenue"], 2),
        })

    return result
