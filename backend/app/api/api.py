from fastapi import APIRouter
from app.api.endpoints import auth, products, sales, dashboard, cash, suppliers, purchases

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(products.router, prefix="/products", tags=["Productos"])
api_router.include_router(sales.router, prefix="/sales", tags=["Ventas"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(cash.router, prefix="/cash", tags=["Caja"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["Proveedores"])
api_router.include_router(purchases.router, prefix="/purchases", tags=["Compras"])
