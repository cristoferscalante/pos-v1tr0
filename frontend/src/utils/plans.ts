// Planes y contacto comercial de V1TR0 POS (landing y aviso de plan vencido).
// La activación es manual: el cliente escribe por WhatsApp, paga, y el
// superadmin le asigna el plan desde "Administración POS".

export const SALES_WHATSAPP = '573228836494';
export const SALES_WHATSAPP_DISPLAY = '322 883 6494';
export const TRIAL_DAYS = 7;

export interface PublicPlan {
  key: 'free' | 'standard' | 'premium';
  name: string;
  price: number;          // COP; 0 = gratis
  period: string;
  highlight?: boolean;
  features: string[];
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    key: 'free',
    name: 'Prueba gratis',
    price: 0,
    period: `${TRIAL_DAYS} días`,
    features: [
      'Todo el sistema para probarlo',
      'Sin tarjeta de crédito',
      'Tus datos se conservan al activar un plan',
    ],
  },
  {
    key: 'standard',
    name: 'Estándar',
    price: 400000,
    period: 'al año',
    highlight: true,
    features: [
      'Ventas al detal y por mayor',
      'Inventario con fotos y escáner con la cámara',
      'Recibos por correo e imagen para WhatsApp',
      'Catálogo en línea con pedidos por WhatsApp',
      'Compras, proveedores y cuentas por pagar',
      'Panel de ventas y ganancias · usuarios cajeros',
      'Funciona sin internet',
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: 570000,
    period: 'al año',
    features: [
      'Todo lo del plan Estándar',
      'Facturación electrónica DIAN',
      '100 facturas electrónicas incluidas',
      'Recarga de 100 facturas por $170.000',
    ],
  },
];

export const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

export function whatsappLink(message: string) {
  return `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
