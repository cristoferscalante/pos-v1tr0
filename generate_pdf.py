import sys
import os

try:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError:
    print("Error: fpdf2 is not installed. Run 'pip install fpdf2' first.")
    sys.exit(1)

class ProposalPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_text_color(100, 100, 100)
            self.set_font('helvetica', 'I', 8)
            self.cell(0, 10, 'Propuesta Comercial POS - v1tr0', border=0, align='R', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_draw_color(220, 220, 220)
            self.line(10, 18, 200, 18)
            self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_text_color(150, 150, 150)
        self.set_font('helvetica', 'I', 8)
        self.cell(0, 10, f'Página {self.page_no()}/{{nb}} | v1tr0 - Cristofer Bolaños', align='C')

def create_proposal():
    pdf = ProposalPDF()
    pdf.alias_nb_pages()
    pdf.set_margins(15, 20, 15)
    pdf.add_page()

    # --- PORTADA / ENCABEZADO ---
    pdf.set_font('helvetica', 'B', 24)
    pdf.set_text_color(40, 50, 80) # Azul oscuro premium
    pdf.cell(0, 15, 'PROPUESTA DE SERVICIOS', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    pdf.set_font('helvetica', 'B', 16)
    pdf.set_text_color(100, 110, 120)
    pdf.cell(0, 10, 'Sistema POS Multi-Negocio y Facturación Electrónica', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)
    
    # Línea decorativa
    pdf.set_draw_color(40, 50, 80)
    pdf.set_line_width(1)
    pdf.line(15, 45, 195, 45)
    pdf.ln(10)

    # --- METADATOS DE LA PROPUESTA ---
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(50, 50, 50)
    
    pdf.cell(30, 7, 'Preparado por:', 0, 0, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(0, 7, 'Cristofer Bolaños Escalante (Representante de v1tr0)', 0, 1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    pdf.set_font('helvetica', '', 10)
    pdf.cell(30, 7, 'Preparado para:', 0, 0, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(0, 7, 'Carolina', 0, 1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    pdf.set_font('helvetica', '', 10)
    pdf.cell(30, 7, 'Fecha:', 0, 0, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(0, 7, '22 de Junio, 2026', 0, 1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(10)

    # --- INTRODUCCIÓN / RESUMEN ---
    pdf.set_font('helvetica', '', 11)
    pdf.set_text_color(30, 30, 30)
    intro_text = (
        "La presente propuesta detalla la implementación de un sistema de Punto de Venta (POS) "
        "con capacidad offline/online, adaptable para múltiples tipos de negocio (veterinarias, tiendas, "
        "restaurantes, papelerías) y preparado para cumplir con los requisitos de facturación electrónica de la DIAN."
    )
    pdf.multi_cell(0, 6, intro_text)
    pdf.ln(8)

    # --- SECCIÓN 1: COMPATIBILIDAD DE HARDWARE ---
    pdf.set_font('helvetica', 'B', 14)
    pdf.set_text_color(40, 50, 80)
    pdf.cell(0, 10, '1. Compatibilidad de Hardware (100% Garantizada)', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(30, 30, 30)
    
    # Detalle de cajón
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(0, 6, '- Cajón Monedero COL-POS (Conector RJ11):', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font('helvetica', '', 10)
    cajon_desc = (
        "Totalmente compatible. El cajón se conecta físicamente al puerto DK de la impresora térmica de recibos. "
        "El sistema POS enviará un pulso eléctrico ESC/POS automáticamente al finalizar cada venta para abrirlo."
    )
    pdf.multi_cell(0, 5, cajon_desc)
    pdf.ln(3)

    # Detalle de escáner
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(0, 6, '- Lector de Códigos de Barras y QR Inalámbrico 2D:', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font('helvetica', '', 10)
    scan_desc = (
        "Totalmente compatible. Al ser un lector 2D, es ideal para escanear productos y leer códigos QR de la DIAN. "
        "Funciona mediante emulación de teclado, integrándose de inmediato con la interfaz del POS."
    )
    pdf.multi_cell(0, 5, scan_desc)
    pdf.ln(10)

    # --- SECCIÓN 2: ALTERNATIVAS DE COBRO ---
    pdf.set_font('helvetica', 'B', 14)
    pdf.set_text_color(40, 50, 80)
    pdf.cell(0, 10, '2. Alternativas de Cobro (Precios Competitivos para Colombia)', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # Tabla de precios
    pdf.set_font('helvetica', 'B', 10)
    pdf.set_fill_color(40, 50, 80)
    pdf.set_text_color(255, 255, 255)
    
    # Headers
    pdf.cell(45, 10, 'Alternativa', 1, 0, 'C', True)
    pdf.cell(60, 10, 'Inversión Inicial', 1, 0, 'C', True)
    pdf.cell(75, 10, 'Costo Recurrente / Licencia', 1, 1, 'C', True)
    
    # Rows
    pdf.set_text_color(30, 30, 30)
    pdf.set_font('helvetica', '', 9)
    
    # Row 1
    pdf.cell(45, 10, 'A. Plan Mensual', 1, 0, 'C')
    pdf.cell(60, 10, '$150.000 COP (Instalación básica)', 1, 0, 'C')
    pdf.cell(75, 10, '$50.000 COP / mes', 1, 1, 'C')
    
    # Row 2
    pdf.cell(45, 10, 'B. Plan Anual (Ahorro)', 1, 0, 'C')
    pdf.cell(60, 10, '$0 COP (Exonerado)', 1, 0, 'C')
    pdf.cell(75, 10, '$480.000 COP / año (Ahorro de 2 meses)', 1, 1, 'C')
    
    # Row 3
    pdf.cell(45, 10, 'C. Licencia de por vida', 1, 0, 'C')
    pdf.cell(60, 10, '$1.200.000 COP (Servidor local/propio)', 1, 0, 'C')
    pdf.cell(75, 10, '$0 COP (Soporte por evento: $50.000/hora)', 1, 1, 'C')
    pdf.ln(8)

    # Detalles de planes
    pdf.set_font('helvetica', 'B', 11)
    pdf.set_text_color(40, 50, 80)
    pdf.cell(0, 6, '¿Qué incluye el software?', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(30, 30, 30)
    incluye_text = (
        "- Acceso al sistema POS responsive (móvil, tablet, computador).\n"
        "- Módulos de facturación rápida, inventario con alertas de stock, y base de datos de clientes/mascotas.\n"
        "- Actualizaciones de software 100% gratuitas y de por vida para todos los clientes (en todos los planes).\n"
        "- Copias de seguridad diarias automatizadas en la nube (para planes mensuales y anuales).\n"
        "- Soporte técnico premium por WhatsApp (incluido en plan mensual y anual; para Licencia de por vida, incluye 3 meses de soporte gratuito y luego a $50.000 COP/hora por evento)."
    )
    pdf.multi_cell(0, 5, incluye_text)
    pdf.ln(8)

    # --- SECCIÓN 3: COSTOS EXTERNOS DIAN ---
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(40, 50, 80)
    pdf.cell(0, 8, '3. Costos Externos Claros (Facturación Electrónica DIAN)', align='L', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(30, 30, 30)
    dian_text = (
        "Para la correcta emisión de tiquetes equivalentes electrónicos avalados por la DIAN, "
        "el cliente final debe asumir directamente los siguientes costos:\n\n"
        "1. Certificado Digital de Firma: Aprox. $150.000 COP al año (se adquiere con Andes SCD o Certicámara).\n"
        "2. Paquete de Folios (Proveedor Tecnológico API): Aprox. $60.000 COP al año por 100 folios de facturación.\n\n"
        "Nota: Nosotros apoyamos y gestionamos todo el proceso de habilitación ante la DIAN sin costo adicional."
    )
    pdf.multi_cell(0, 5, dian_text)
    
    # Save the file
    pdf.output("Propuesta_POS_v1tr0.pdf")
    print("PDF generated successfully: Propuesta_POS_v1tr0.pdf")

if __name__ == "__main__":
    create_proposal()
