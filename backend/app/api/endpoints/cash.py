from datetime import datetime
from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.core.db import get_session
from app.models.cash_session import CashSession, CashSessionClose, CashSessionOpen
from app.models.sale import Sale
from app.models.user import User
from app.services.notifications import notify_event

router = APIRouter()


def _get_open_session(session: Session, tenant_id: uuid.UUID) -> CashSession | None:
    return session.exec(
        select(CashSession).where(
            CashSession.tenant_id == tenant_id,
            CashSession.status == "open",
        )
    ).first()


def _get_session_metrics(session: Session, cash_session_id: uuid.UUID) -> tuple[int, Decimal]:
    sales = session.exec(select(Sale).where(Sale.cash_session_id == cash_session_id)).all()
    total = sum((sale.total for sale in sales), Decimal("0"))
    return len(sales), total


@router.get("/current")
def get_current_cash_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    cash_session = _get_open_session(session, current_user.tenant_id)
    if not cash_session:
        return {"session": None}

    sales_count, sales_total = _get_session_metrics(session, cash_session.id)
    return {
        "session": cash_session,
        "sales_count": sales_count,
        "sales_total": sales_total,
        "expected_amount": cash_session.opening_amount + sales_total,
    }


@router.get("/")
def list_cash_sessions(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    cash_sessions = session.exec(
        select(CashSession)
        .where(CashSession.tenant_id == current_user.tenant_id)
        .order_by(CashSession.opened_at.desc())
    ).all()

    result = []
    for cash_session in cash_sessions[:20]:
        sales_count, sales_total = _get_session_metrics(session, cash_session.id)
        result.append(
            {
                "session": cash_session,
                "sales_count": sales_count,
                "sales_total": sales_total,
                "expected_amount": cash_session.expected_closing_amount or (cash_session.opening_amount + sales_total),
            }
        )
    return result


@router.post("/open", status_code=status.HTTP_201_CREATED)
def open_cash_session(
    data: CashSessionOpen,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    open_session = _get_open_session(session, current_user.tenant_id)
    if open_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una caja abierta para este negocio",
        )

    cash_session = CashSession(
        tenant_id=current_user.tenant_id,
        opened_by_user_id=current_user.id,
        opening_amount=data.opening_amount,
        notes=data.notes,
    )
    session.add(cash_session)
    session.commit()
    session.refresh(cash_session)

    try:
        notify_event(session, current_user.tenant_id, "cash_opened", {"cash_session": cash_session})
    except Exception as exc:
        print(f"No se pudo notificar apertura de caja: {exc}")

    return {
        "session": cash_session,
        "sales_count": 0,
        "sales_total": Decimal("0"),
        "expected_amount": cash_session.opening_amount,
    }


@router.post("/{session_id}/close")
def close_cash_session(
    session_id: uuid.UUID,
    data: CashSessionClose,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    cash_session = session.get(CashSession, session_id)
    if not cash_session or cash_session.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caja no encontrada")

    if cash_session.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La caja ya fue cerrada")

    sales_count, sales_total = _get_session_metrics(session, cash_session.id)
    expected_amount = cash_session.opening_amount + sales_total

    cash_session.status = "closed"
    cash_session.closed_by_user_id = current_user.id
    cash_session.closed_at = datetime.utcnow()
    cash_session.expected_closing_amount = expected_amount
    cash_session.actual_closing_amount = data.actual_closing_amount
    cash_session.notes = data.notes or cash_session.notes

    session.add(cash_session)
    session.commit()
    session.refresh(cash_session)

    try:
        notify_event(
            session,
            current_user.tenant_id,
            "cash_closed",
            {
                "cash_session": cash_session,
                "sales_count": sales_count,
                "expected_amount": expected_amount,
            },
        )
    except Exception as exc:
        print(f"No se pudo notificar cierre de caja: {exc}")

    return {
        "session": cash_session,
        "sales_count": sales_count,
        "sales_total": sales_total,
        "expected_amount": expected_amount,
        "difference_amount": (data.actual_closing_amount or Decimal("0")) - expected_amount,
    }
