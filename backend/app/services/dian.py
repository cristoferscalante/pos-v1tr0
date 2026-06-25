import hashlib
from datetime import datetime
from sqlmodel import Session
from app.models.sale import Sale

class DianService:
    @staticmethod
    def transmit_to_dian(sale: Sale, session: Session) -> dict:
        """
        Simula la transmisión de la factura de venta al Proveedor Tecnológico y a la DIAN.
        Genera el CUFE/CUDE y la URL del Código QR de validación en la DIAN.
        """
        # 1. Simulación de generación del CUDE/CUFE (SHA-256 de campos clave de la venta)
        raw_string = f"{sale.sale_number}|{sale.total}|{sale.created_at.isoformat()}|{sale.tenant_id}"
        hash_object = hashlib.sha256(raw_string.encode('utf-8'))
        cude_cufe = hash_object.hexdigest()

        # 2. Generación de URL del QR oficial de la DIAN (ambiente de pruebas / producción)
        # En Colombia, las URLs de consulta pública de la DIAN llevan el CUFE como parámetro
        qr_url = f"https://catalogo-vp.dian.gov.co/document/searchqr?documentkey={cude_cufe}"

        # 3. Estructuración del JSON UBL 2.1 que se enviaría al Proveedor Tecnológico
        dian_payload = {
            "invoice_number": sale.sale_number,
            "issue_date": sale.created_at.strftime("%Y-%m-%d"),
            "issue_time": sale.created_at.strftime("%H:%M:%S-05:00"),
            "invoice_type": "10" if sale.total > 0 else "11", # 10: Factura de venta estándar, 11: Documento equivalente POS
            "payment_method": "1" if sale.payment_method == "cash" else "2", # 1: Efectivo, 2: Crédito/Tarjeta
            "totals": {
                "subtotal": float(sale.subtotal),
                "tax": float(sale.tax),
                "total": float(sale.total)
            },
            "technical_provider": "v1tr0 Tech Provider API",
            "dian_profile": "UBL 2.1"
        }

        # 4. Actualizar metadatos de la venta en la Base de Datos
        dian_metadata = {
            "dian_status": "aprobado",
            "cufe": cude_cufe,
            "qr_url": qr_url,
            "transmission_date": datetime.utcnow().isoformat(),
            "payload_preview": dian_payload
        }
        
        # Combinar metadatos anteriores con los nuevos de la DIAN
        current_metadata = dict(sale.meta_data) if sale.meta_data else {}
        current_metadata.update(dian_metadata)
        sale.meta_data = current_metadata
        
        session.add(sale)
        session.commit()
        session.refresh(sale)
        
        return dian_metadata
