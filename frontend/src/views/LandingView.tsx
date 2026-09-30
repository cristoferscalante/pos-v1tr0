import { useEffect, useState } from 'react';
import {
  ShoppingCart, Tags, ScanBarcode, Camera, Receipt, WifiOff, Globe, ChartColumn,
  Truck, Users, FileCheck, Check, ChevronDown, MessageCircle, ArrowRight, Expand, Play,
  Banknote, Sparkles, ShieldCheck, Smartphone,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { AutoPlayVideo, Lightbox, type LightboxItem } from '../components/Lightbox';
import { PUBLIC_PLANS, SALES_WHATSAPP_DISPLAY, TRIAL_DAYS, formatCOP, whatsappLink } from '../utils/plans';

const shot = (name: string) => `/landing/${name}.jpg`;

// Funciones clave: cada una con una captura real de la app
const SPOTLIGHTS = [
  {
    img: 'vueltas', eyebrow: 'Vender', icon: Banknote,
    title: 'Cobra en segundos y la app calcula las vueltas',
    text: 'Toca los productos, elige efectivo, tarjeta o transferencia y listo. Si te pagan en efectivo, toca el billete y ves las vueltas al instante.',
    points: ['Botones con los billetes de siempre', 'Avisa si falta dinero', 'Sin calculadora al lado'],
  },
  {
    img: 'por-mayor', eyebrow: 'Precios', icon: Tags,
    title: 'Detal y por mayor con un solo toque',
    text: 'Cada producto tiene su precio al detal y al por mayor. Cambias la pestaña y todos los precios, el total y el recibo se ajustan solos.',
    points: ['Cuentas separadas de cada tipo de venta', 'Ganancia real de cada modalidad', 'El recibo dice si fue por mayor'],
  },
  {
    img: 'escaner', eyebrow: 'Escáner', icon: ScanBarcode,
    title: 'La cámara del celular es tu lector de códigos',
    text: 'Apunta al código de barras o QR del producto y entra al carrito. También sirve para crear productos y buscar en el inventario.',
    points: ['Sin comprar lector', 'Lee EAN, UPC, Code 128 y QR', 'Linterna para lugares oscuros'],
  },
  {
    img: 'alta-ganancia', eyebrow: 'Inventario', icon: Camera,
    title: 'Crea productos con foto y conoce tu ganancia',
    text: 'Tómale la foto al producto desde la app, escribe cuánto te cuesta y a cuánto lo vendes. Ves de una vez cuánto ganas al detal y por mayor.',
    points: ['Fotos optimizadas que pesan poco', 'Alerta de stock bajo', 'Categorías a tu medida'],
  },
  {
    img: 'recibo', eyebrow: 'Recibos', icon: Receipt,
    title: 'Recibos profesionales con los datos de tu negocio',
    text: 'Imprímelo, envíalo al correo del cliente o compártelo como imagen por WhatsApp. Con tu NIT, dirección, teléfono y tu mensaje.',
    points: ['Recibo por correo automático', 'Imagen lista para WhatsApp', 'Muestra recibido y vueltas'],
  },
  {
    img: 'catalogo', eyebrow: 'Catálogo en línea', icon: Globe,
    title: 'Un catálogo que vende por ti las 24 horas',
    text: 'Comparte un enlace con tus productos y precios. Tus clientes arman el pedido y te lo envían por WhatsApp, con precio por mayor si lo activas.',
    points: ['Se actualiza con tu inventario', 'Muestra cuando quedan pocas unidades', 'Pedidos directo a tu WhatsApp'],
  },
  {
    img: 'panel', eyebrow: 'Ganancias', icon: ChartColumn,
    title: 'Sabes cuánto vendes y cuánto ganas cada día',
    text: 'El panel te muestra ventas, ingresos y ganancia del día y del mes, separados entre detal y por mayor, más el cuadre de tu caja.',
    points: ['Productos más vendidos', 'Stock bajo a la vista', 'Cuadre de caja al cerrar'],
  },
];

const MORE_FEATURES = [
  { icon: WifiOff, title: 'Funciona sin internet', text: 'Sigues vendiendo aunque se caiga la conexión; todo se sincroniza solo.' },
  { icon: Truck, title: 'Compras y proveedores', text: 'Registra la mercancía que llega y controla lo que debes.' },
  { icon: Users, title: 'Usuarios para cajeros', text: 'Tus empleados venden sin ver tus ganancias.' },
  { icon: FileCheck, title: 'Factura electrónica', text: 'En el plan Premium facturas a la DIAN desde la venta.' },
  { icon: ShoppingCart, title: 'Varios dispositivos', text: 'Celular, tablet o computador, con los mismos datos.' },
  { icon: ShieldCheck, title: 'Tus datos seguros', text: 'Copias de seguridad y acceso con tu propia cuenta.' },
];

const GALLERY: LightboxItem[] = [
  { type: 'image', src: shot('vender'), title: 'Vender', text: 'Toca los productos y se agregan al carrito.' },
  { type: 'image', src: shot('por-mayor'), title: 'Precios por mayor', text: 'Un toque y cambian todos los precios.' },
  { type: 'image', src: shot('vueltas'), title: '¿Con cuánto paga?', text: 'Toca el billete y ves las vueltas.' },
  { type: 'image', src: shot('recibo'), title: 'Recibo', text: 'Imprímelo, envíalo por correo o compártelo.' },
  { type: 'image', src: shot('escaner'), title: 'Escáner con la cámara', text: 'El código se lee solo.' },
  { type: 'image', src: shot('alta-foto'), title: 'Producto con foto', text: 'Tómala desde la misma app.' },
  { type: 'image', src: shot('alta-ganancia'), title: 'Costo y precios', text: 'Tu ganancia al detal y por mayor.' },
  { type: 'image', src: shot('inventario'), title: 'Inventario', text: 'Precios, costo, margen y stock.' },
  { type: 'image', src: shot('panel'), title: 'Panel', text: 'Ventas y ganancias del día y del mes.' },
  { type: 'image', src: shot('catalogo'), title: 'Catálogo en línea', text: 'Tus clientes te piden por WhatsApp.' },
];

const VIDEOS: LightboxItem[] = [
  { type: 'video', src: '/landing/videos/vender.mp4', poster: '/landing/videos/vender.jpg', title: 'Vender', text: 'Agrega productos, escanea, cambia a por mayor y cobra.' },
  { type: 'video', src: '/landing/videos/inventario.mp4', poster: '/landing/videos/inventario.jpg', title: 'Inventario', text: 'Crea un producto con foto, costo y dos precios.' },
  { type: 'video', src: '/landing/videos/catalogo.mp4', poster: '/landing/videos/catalogo.jpg', title: 'Catálogo en línea', text: 'El cliente arma el pedido y te lo envía por WhatsApp.' },
];

const BUSINESS_TYPES = ['Tiendas', 'Minimercados', 'Veterinarias', 'Droguerías', 'Panaderías', 'Restaurantes', 'Papelerías', 'Ferreterías', 'Distribuidoras', 'Misceláneas', 'Licoreras', 'Cafeterías'];

const FAQ = [
  { q: '¿Necesito tarjeta para la prueba gratis?', a: `No. Te registras con tu correo y usas todo el sistema durante ${TRIAL_DAYS} días sin pagar nada.` },
  { q: '¿Qué pasa cuando termina la prueba?', a: 'La app te muestra los planes. Nos escribes por WhatsApp, pagas y activamos tu plan. Todo lo que registraste se conserva.' },
  { q: '¿Cómo pago el plan?', a: `Escríbenos al WhatsApp ${SALES_WHATSAPP_DISPLAY}: te damos los medios de pago y activamos tu cuenta apenas se confirme el pago.` },
  { q: '¿Funciona si se va el internet?', a: 'Sí. Puedes seguir vendiendo; las ventas quedan guardadas en el celular y se envían solas cuando vuelve la conexión.' },
  { q: '¿Sirve para mi tipo de negocio?', a: 'Tiendas, minimercados, veterinarias, droguerías, restaurantes, papelerías, ferreterías y cualquier negocio que venda productos.' },
  { q: '¿Tengo que instalar algo?', a: 'No. Abres la página en el navegador del celular o del computador. Si quieres, la agregas a la pantalla de inicio como una app.' },
];

type Viewer = { items: LightboxItem[]; index: number } | null;

export function LandingView() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const waGeneral = whatsappLink('Hola, quiero información sobre V1TR0 POS para mi negocio.');

  // Aparición suave de las secciones al hacer scroll
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Barra fija "Prueba gratis" en el celular después de pasar la portada
  useEffect(() => {
    const onScroll = () => setShowStickyCta(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openGallery = (src: string) => setViewer({ items: GALLERY, index: Math.max(0, GALLERY.findIndex(g => g.src === src)) });

  return (
    <div className="landing">
      <header className="landing-nav">
        <a href="/" className="landing-nav-brand" aria-label="V1TR0 POS, inicio"><BrandLogo size={36} /></a>
        <nav className="landing-nav-links" aria-label="Secciones">
          <a href="#funciones">Funciones</a>
          <a href="#galeria">Galería</a>
          <a href="#videos">Videos</a>
          <a href="#planes">Planes</a>
        </nav>
        <a href="/login" className="btn-secondary landing-nav-login">Ingresar</a>
        <a href="/registro" className="btn-primary landing-nav-cta">Prueba gratis</a>
      </header>

      {/* ---------- Portada ---------- */}
      <section className="landing-hero">
        <div className="landing-hero-copy" data-reveal>
          <span className="landing-badge"><Sparkles size={14} /> Prueba gratis {TRIAL_DAYS} días · sin tarjeta</span>
          <h1>Tu punto de venta completo, <span>en el celular</span></h1>
          <p>
            Vende al detal y por mayor, calcula las vueltas, controla tu inventario, envía recibos y conoce tus
            ganancias del día. Sigue funcionando aunque se caiga el internet.
          </p>
          <div className="landing-cta">
            <a href="/registro" className="btn-primary landing-cta-main">Empezar prueba gratis <ArrowRight size={18} /></a>
            <a href="#videos" className="btn-secondary landing-cta-wa"><Play size={18} /> Ver cómo funciona</a>
          </div>
          <ul className="landing-trust">
            <li><Check size={16} /> Listo en 2 minutos</li>
            <li><Check size={16} /> Celular, tablet o computador</li>
            <li><Check size={16} /> Soporte por WhatsApp</li>
          </ul>
        </div>

        <div className="landing-stage" data-reveal>
          <div className="landing-glow" aria-hidden="true" />
          <button type="button" className="landing-phone back" onClick={() => openGallery(shot('panel'))} aria-label="Ver captura del panel">
            <img src={shot('panel')} alt="" />
          </button>
          <div className="landing-phone front">
            <AutoPlayVideo src="/landing/videos/hero.mp4" poster="/landing/videos/hero.jpg" label="La app vendiendo: carrito, precio por mayor y vueltas" />
          </div>
          <div className="landing-float f1"><Banknote size={16} /> Vueltas <strong>$29.900</strong></div>
          <div className="landing-float f2"><Tags size={16} /> Venta por mayor</div>
          <div className="landing-float f3"><Check size={16} /> Recibo enviado</div>
        </div>
      </section>

      {/* ---------- Tipos de negocio (cinta en movimiento) ---------- */}
      <div className="landing-marquee" aria-label="Negocios que lo usan">
        <div className="landing-marquee-track">
          {[...BUSINESS_TYPES, ...BUSINESS_TYPES].map((t, i) => <span key={i} aria-hidden={i >= BUSINESS_TYPES.length}>{t}</span>)}
        </div>
      </div>

      {/* ---------- Cifras ---------- */}
      <section className="landing-stats" data-reveal>
        <div><strong>{TRIAL_DAYS} días</strong><span>de prueba gratis</span></div>
        <div><strong>$0</strong><span>en equipos: usa tu celular</span></div>
        <div><strong>24/7</strong><span>aunque no haya internet</span></div>
        <div><strong>2 min</strong><span>para empezar a vender</span></div>
      </section>

      {/* ---------- Funciones clave ---------- */}
      <section id="funciones" className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow">Todo en tu bolsillo</span>
          <h2>Pensado para vender detrás del mostrador</h2>
          <p className="landing-section-sub">Cada función, con capturas reales de la app. Toca una imagen para verla en grande.</p>
        </div>
        <div className="landing-spotlights">
          {SPOTLIGHTS.map((s, i) => {
            const Icon = s.icon;
            return (
              <article key={s.img} className={`landing-spotlight ${i % 2 ? 'reverse' : ''}`} data-reveal>
                <div className="landing-spotlight-copy">
                  <span className="landing-eyebrow"><Icon size={15} /> {s.eyebrow}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <ul>{s.points.map(p => <li key={p}><Check size={16} /> {p}</li>)}</ul>
                </div>
                <button type="button" className="landing-spotlight-shot" onClick={() => openGallery(shot(s.img))} aria-label={`Ampliar captura: ${s.title}`}>
                  <img src={shot(s.img)} alt={s.title} loading="lazy" />
                  <span className="landing-zoom"><Expand size={16} /> Ampliar</span>
                </button>
              </article>
            );
          })}
        </div>

        <div className="landing-more" data-reveal>
          <h3>Y además</h3>
          <div className="landing-features">
            {MORE_FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="landing-feature">
                <span className="landing-feature-icon"><Icon size={20} /></span>
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Galería ---------- */}
      <section id="galeria" className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow"><Smartphone size={15} /> Galería</span>
          <h2>Así se ve en tu celular</h2>
          <p className="landing-section-sub">Desliza y toca cualquier pantalla para verla completa.</p>
        </div>
        <div className="landing-gallery" data-reveal>
          {GALLERY.map((g, i) => (
            <button key={g.src} type="button" className="landing-gallery-item" onClick={() => setViewer({ items: GALLERY, index: i })} aria-label={`Ver pantalla: ${g.title}`}>
              <img src={g.src} alt={g.title} loading="lazy" />
              <span>{g.title}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Videos ---------- */}
      <section id="videos" className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow"><Play size={15} /> Videos</span>
          <h2>Míralo en acción</h2>
          <p className="landing-section-sub">Se reproducen solos. Toca uno para verlo en grande desde el principio.</p>
        </div>
        <div className="landing-videos" data-reveal>
          {VIDEOS.map((v, i) => (
            <figure key={v.src} className="landing-video">
              <button type="button" className="landing-video-frame" onClick={() => setViewer({ items: VIDEOS, index: i })} aria-label={`Ver en grande: ${v.title}`}>
                <AutoPlayVideo src={v.src} poster={v.poster} label={`Video: ${v.title}`} />
                <span className="landing-video-play"><Expand size={18} /> Ver en grande</span>
              </button>
              <figcaption>
                <strong>{v.title}</strong>
                <span>{v.text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- Cómo empezar ---------- */}
      <section className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow">Cómo empezar</span>
          <h2>En tres pasos estás vendiendo</h2>
        </div>
        <ol className="landing-steps" data-reveal>
          <li><strong>Crea tu cuenta</strong><span>Con el nombre de tu negocio y tu correo. Sin tarjeta.</span></li>
          <li><strong>Pruébalo {TRIAL_DAYS} días gratis</strong><span>Sube tus productos y haz ventas reales.</span></li>
          <li><strong>Activa tu plan</strong><span>Escríbenos por WhatsApp, pagas y sigues con tus datos intactos.</span></li>
        </ol>
      </section>

      {/* ---------- Planes ---------- */}
      <section id="planes" className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow">Planes</span>
          <h2>Simples, sin letra pequeña, pago anual</h2>
          <p className="landing-section-sub">Activamos tu plan por WhatsApp. Sin cobros escondidos.</p>
        </div>
        <div className="landing-plans" data-reveal>
          {PUBLIC_PLANS.map(plan => (
            <article key={plan.key} className={`landing-plan ${plan.highlight ? 'featured' : ''}`}>
              {plan.highlight && <span className="landing-plan-tag">Más elegido</span>}
              <h3>{plan.name}</h3>
              <div className="landing-plan-price">
                <strong>{plan.price ? formatCOP(plan.price) : 'Gratis'}</strong>
                <span>{plan.period}</span>
              </div>
              {plan.price > 0 && <p className="landing-plan-month">Equivale a {formatCOP(Math.round(plan.price / 12))} al mes</p>}
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

      {/* ---------- Preguntas ---------- */}
      <section id="preguntas" className="landing-section">
        <div className="landing-section-head" data-reveal>
          <span className="landing-eyebrow">Preguntas</span>
          <h2>Lo que más nos preguntan</h2>
        </div>
        <div className="landing-faq" data-reveal>
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

      {/* ---------- Cierre ---------- */}
      <section className="landing-final" data-reveal>
        <h2>¿Listo para vender más ordenado?</h2>
        <p>Crea tu cuenta y pruébalo {TRIAL_DAYS} días gratis. Sin tarjeta, sin instalar nada.</p>
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

      <div className={`landing-sticky-cta ${showStickyCta ? 'show' : ''}`} aria-hidden={!showStickyCta}>
        <a href="/registro" className="btn-primary" tabIndex={showStickyCta ? 0 : -1}>Prueba gratis {TRIAL_DAYS} días <ArrowRight size={17} /></a>
        <a href={waGeneral} target="_blank" rel="noreferrer" className="landing-sticky-wa" aria-label="WhatsApp" tabIndex={showStickyCta ? 0 : -1}>
          <MessageCircle size={20} />
        </a>
      </div>

      {viewer && (
        <Lightbox
          items={viewer.items}
          index={viewer.index}
          onIndex={index => setViewer(v => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
