import { useState } from 'react';
import {
  ShoppingCart, Tags, ScanBarcode, Camera, Receipt, WifiOff, Globe, ChartColumn,
  Truck, Users, FileCheck, Check, ChevronDown, MessageCircle, ArrowRight,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { PUBLIC_PLANS, SALES_WHATSAPP_DISPLAY, TRIAL_DAYS, formatCOP, whatsappLink } from '../utils/plans';

const FEATURES = [
  { icon: ShoppingCart, title: 'Vende desde el celular', text: 'Agrega productos con un toque, cobra en efectivo, tarjeta o transferencia y entrega el recibo.' },
  { icon: Tags, title: 'Precio al detal y por mayor', text: 'Cada producto tiene sus dos precios. Cambias con una pestaña y tus cuentas quedan separadas.' },
  { icon: ScanBarcode, title: 'Escáner con la cámara', text: 'Lee códigos de barras y QR con la cámara del celular, sin comprar lector.' },
  { icon: Camera, title: 'Inventario con fotos', text: 'Toma la foto del producto en la misma app. Controla stock, costos y márgenes.' },
  { icon: Receipt, title: 'Recibos por correo y WhatsApp', text: 'Envía el recibo al correo del cliente o compártelo como imagen, con los datos de tu negocio.' },
  { icon: WifiOff, title: 'Funciona sin internet', text: 'Si se cae la conexión sigues vendiendo. Las ventas se sincronizan solas al volver.' },
  { icon: Globe, title: 'Catálogo en línea', text: 'Un enlace con tus productos para compartir. Tus clientes te piden por WhatsApp.' },
  { icon: ChartColumn, title: 'Ventas y ganancias', text: 'Cuánto vendes y cuánto ganas cada día, al detal y al por mayor, y el cuadre de caja.' },
  { icon: Truck, title: 'Compras y proveedores', text: 'Registra la mercancía que llega y lleva el control de lo que debes.' },
  { icon: Users, title: 'Usuarios para cajeros', text: 'Tus empleados venden con su propio usuario, sin ver tus ganancias.' },
  { icon: FileCheck, title: 'Facturación electrónica', text: 'En el plan Premium emites factura electrónica DIAN desde la misma venta.' },
];

const SCREENS = [
  { src: '/landing/vender.jpg', label: 'Vender' },
  { src: '/landing/por-mayor.jpg', label: 'Precios por mayor' },
  { src: '/landing/panel.jpg', label: 'Tus ganancias' },
  { src: '/landing/inventario.jpg', label: 'Inventario' },
];

const FAQ = [
  { q: '¿Necesito tarjeta para la prueba gratis?', a: `No. Te registras con tu correo y usas todo el sistema durante ${TRIAL_DAYS} días sin pagar nada.` },
  { q: '¿Qué pasa cuando termina la prueba?', a: 'La app te muestra los planes. Nos escribes por WhatsApp, pagas y activamos tu plan. Todo lo que registraste se conserva.' },
  { q: '¿Cómo pago el plan?', a: `Escríbenos al WhatsApp ${SALES_WHATSAPP_DISPLAY}: te damos los medios de pago y activamos tu cuenta apenas se confirme el pago.` },
  { q: '¿Funciona si se va el internet?', a: 'Sí. Puedes seguir vendiendo; las ventas quedan guardadas en el celular y se envían solas cuando vuelve la conexión.' },
  { q: '¿Sirve para mi tipo de negocio?', a: 'Tiendas, minimercados, veterinarias, droguerías, restaurantes, papelerías, ferreterías y cualquier negocio que venda productos.' },
  { q: '¿Tengo que instalar algo?', a: 'No. Abres la página en el navegador del celular o del computador. Si quieres, la agregas a la pantalla de inicio como una app.' },
];

export function LandingView() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const waGeneral = whatsappLink('Hola, quiero información sobre V1TR0 POS para mi negocio.');

  return (
    <div className="landing">
      <header className="landing-nav">
        <a href="/" className="landing-nav-brand" aria-label="V1TR0 POS, inicio"><BrandLogo size={36} /></a>
        <nav className="landing-nav-links" aria-label="Secciones">
          <a href="#funciones">Funciones</a>
          <a href="#planes">Planes</a>
          <a href="#preguntas">Preguntas</a>
        </nav>
        <a href="/login" className="btn-secondary landing-nav-login">Ingresar</a>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-badge">Prueba gratis {TRIAL_DAYS} días · sin tarjeta</span>
          <h1>Tu punto de venta completo, <span>en el celular</span></h1>
          <p>
            Vende al detal y por mayor, controla tu inventario, envía recibos y conoce tus ganancias del día.
            Sigue funcionando aunque se caiga el internet.
          </p>
          <div className="landing-cta">
            <a href="/registro" className="btn-primary landing-cta-main">Empezar prueba gratis <ArrowRight size={18} /></a>
            <a href={waGeneral} target="_blank" rel="noreferrer" className="btn-secondary landing-cta-wa">
              <MessageCircle size={18} /> Hablar por WhatsApp
            </a>
          </div>
          <ul className="landing-trust">
            <li><Check size={16} /> Listo en 2 minutos</li>
            <li><Check size={16} /> Celular, tablet o computador</li>
            <li><Check size={16} /> Soporte por WhatsApp</li>
          </ul>
        </div>
        <div className="landing-phones" aria-hidden="true">
          <div className="landing-phone back"><img src="/landing/panel.jpg" alt="" loading="lazy" /></div>
          <div className="landing-phone front"><img src="/landing/por-mayor.jpg" alt="" /></div>
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="landing-section">
        <h2>Todo lo que tu negocio necesita para vender</h2>
        <p className="landing-section-sub">Pensado para usarse en el celular, detrás del mostrador o en la calle.</p>
        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="landing-feature">
              <span className="landing-feature-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Capturas */}
      <section className="landing-section">
        <h2>Así se ve en tu celular</h2>
        <div className="landing-screens">
          {SCREENS.map(s => (
            <figure key={s.src}>
              <img src={s.src} alt={`Pantalla de ${s.label}`} loading="lazy" />
              <figcaption>{s.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="landing-section">
        <h2>Empieza hoy mismo</h2>
        <ol className="landing-steps">
          <li><strong>Crea tu cuenta</strong><span>Con el nombre de tu negocio y tu correo. Sin tarjeta.</span></li>
          <li><strong>Pruébalo {TRIAL_DAYS} días gratis</strong><span>Sube tus productos y haz ventas reales.</span></li>
          <li><strong>Activa tu plan</strong><span>Escríbenos por WhatsApp, pagas y seguimos con tus datos intactos.</span></li>
        </ol>
      </section>

      {/* Planes */}
      <section id="planes" className="landing-section">
        <h2>Planes simples, pago anual</h2>
        <p className="landing-section-sub">Sin cobros escondidos. Activamos tu plan por WhatsApp.</p>
        <div className="landing-plans">
          {PUBLIC_PLANS.map(plan => (
            <article key={plan.key} className={`landing-plan ${plan.highlight ? 'featured' : ''}`}>
              {plan.highlight && <span className="landing-plan-tag">Más elegido</span>}
              <h3>{plan.name}</h3>
              <div className="landing-plan-price">
                <strong>{plan.price ? formatCOP(plan.price) : 'Gratis'}</strong>
                <span>{plan.period}</span>
              </div>
              <ul>
                {plan.features.map(f => <li key={f}><Check size={16} /> {f}</li>)}
              </ul>
              {plan.price === 0 ? (
                <a href="/registro" className="btn-secondary landing-plan-cta">Empezar gratis</a>
              ) : (
                <a
                  href={whatsappLink(`Hola, quiero el plan ${plan.name} de V1TR0 POS (${formatCOP(plan.price)} ${plan.period}).`)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${plan.highlight ? 'btn-primary' : 'btn-secondary'} landing-plan-cta`}
                >
                  <MessageCircle size={17} /> Quiero este plan
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="landing-section">
        <h2>Preguntas frecuentes</h2>
        <div className="landing-faq">
          {FAQ.map((item, i) => (
            <div key={item.q} className={`landing-faq-item ${openFaq === i ? 'open' : ''}`}>
              <button type="button" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {item.q} <ChevronDown size={18} />
              </button>
              {openFaq === i && <p>{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Cierre */}
      <section className="landing-final">
        <h2>¿Listo para vender más ordenado?</h2>
        <p>Crea tu cuenta y pruébalo {TRIAL_DAYS} días gratis.</p>
        <div className="landing-cta">
          <a href="/registro" className="btn-primary landing-cta-main">Crear mi cuenta gratis <ArrowRight size={18} /></a>
          <a href={waGeneral} target="_blank" rel="noreferrer" className="btn-secondary landing-cta-wa">
            <MessageCircle size={18} /> WhatsApp {SALES_WHATSAPP_DISPLAY}
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <BrandLogo size={28} />
        <span>© {new Date().getFullYear()} V1TR0 · Punto de venta para negocios en Colombia</span>
        <a href="/login">Ingresar</a>
      </footer>

      <a href={waGeneral} target="_blank" rel="noreferrer" className="landing-wa-fab" aria-label="Escríbenos por WhatsApp">
        <MessageCircle size={24} />
      </a>
    </div>
  );
}
