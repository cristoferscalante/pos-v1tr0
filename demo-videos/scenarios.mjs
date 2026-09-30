// Guiones de cada video. Cada paso: subtítulo (say) + interacción (tap / type).
import { ean13 } from './demo-data.mjs';

const productCard = name => `.product-card:has-text("${name}")`;
const openMore = async h => {
  await h.tap('.nav-more', { wait: 900 });
};

export const SCENARIOS = [
  // ------------------------------------------------------------------ Ingreso
  {
    id: 'ingreso',
    file: '01-ingreso',
    title: 'Ingresar a la app',
    loggedIn: false,
    async run(h) {
      await h.title('Ingresar', 'Abre la app desde el celular e ingresa con el correo y la contraseña de tu negocio.', '→');
      await h.say('Escribe el correo con el que registraste tu negocio.', { pos: 'top', wait: 1400 });
      await h.type('input[placeholder="correo@negocio.com"]', 'rosa@tiendademo.co');
      await h.say('Luego tu contraseña.', { pos: 'top', wait: 1000 });
      await h.type('input[placeholder="••••••••"]', 'MiClave2026', { delay: 60 });
      await h.say('Toca "Ingresar al Sistema".', { pos: 'top', wait: 900 });
      await h.tap('button:has-text("Ingresar al Sistema")', { wait: 2200 });
      await h.say('¡Listo! Entras directo a la pantalla de ventas. Abajo tienes el menú: Vender, Inventario, Ventas, Panel y Más.', { pos: 'middle', wait: 3200 });
      await h.pointAt('.sidebar-nav');
      await h.sleep(1500);
    },
  },

  // ------------------------------------------------------------------ Vender
  {
    id: 'vender',
    file: '02-vender',
    title: 'Vender',
    cameraCode: ean13('770123450007'), // Gaseosa 1.5 L
    async run(h) {
      const { page } = h;
      await h.title('Vender', 'Cobra al detal o al por mayor, escanea productos con la cámara y entrega el recibo.', '$');
      await h.say('Esta es la pantalla para vender. Toca un producto para agregarlo al carrito.', { pos: 'middle' });
      await h.hide();
      await h.tap(productCard('Arroz 500 g'), { wait: 500 });
      await h.tap(productCard('Arroz 500 g'), { wait: 500 });
      await h.tap(productCard('Leche 1 L'), { wait: 800 });

      await h.say('También puedes buscar por nombre o código.', { pos: 'middle', wait: 1600 });
      await h.hide();
      await h.type('.pos-catalog-header input', 'café');
      await h.tap(productCard('Café molido'), { wait: 700 });
      await h.clear('.pos-catalog-header input');
      await h.sleep(500);

      await h.say('O escanea el código de barras con la cámara del celular.', { pos: 'middle', wait: 1800 });
      await h.hide();
      await h.tap('[aria-label="Escanear código con la cámara"]', { wait: 300 });
      await h.say('Apunta la cámara al código: se lee solo y el producto entra al carrito.', { pos: 'top', wait: 200 });
      await page.locator('.scanner-backdrop').waitFor({ state: 'detached', timeout: 15000 });
      await h.sleep(1400);
      await h.hide();

      await h.say('Arriba eliges el tipo de precio. Ahora estás vendiendo al detal.', { pos: 'middle', wait: 2200 });
      await h.pointAt('role=tab[name="Precios al detal"]');
      await h.sleep(700);
      await h.say('Toca "Precios por mayor": todos los precios y el total cambian al instante.', { pos: 'middle', wait: 1200 });
      await h.tap('role=tab[name="Precios por mayor"]', { wait: 2200 });
      await h.hide();

      await h.say('Toca la barra de abajo para ver el carrito.', { pos: 'middle', wait: 1600 });
      await h.hide();
      await h.tap('.pos-mobile-bar', { wait: 1000 });
      await h.say('Ajusta las cantidades con + y –.', { pos: 'top', wait: 1000 });
      await h.tap(page.locator('.cart-item').first().locator('.qty-btn').nth(1), { wait: 900 });
      await h.say('Elige cómo te pagan: efectivo, tarjeta o transferencia.', { pos: 'top', wait: 1000 });
      await h.tap(page.locator('.payment-btn', { hasText: 'Transferencia' }), { wait: 900 });
      await h.say('Toca "Vender" para registrar la venta.', { pos: 'top', wait: 1000 });
      await h.tap('.btn-checkout', { wait: 2200 });
      await h.say('¡Listo! La venta queda guardada al por mayor y puedes imprimir el recibo.', { pos: 'top', wait: 3200 });
      await h.tap(page.getByRole('button', { name: 'Nueva Venta' }), { wait: 900 });
    },
  },

  // ------------------------------------------------------------------ Inventario
  {
    id: 'inventario',
    file: '03-inventario',
    title: 'Inventario',
    cameraCode: ean13('770123450009'), // código nuevo para el azúcar
    async run(h) {
      const { page } = h;
      const modal = page.locator('.modal-box');
      const next = () => h.tap(modal.getByRole('button', { name: /Siguiente/ }), { wait: 1000 });

      await h.title('Inventario', 'Tus productos con precio al detal, por mayor, costo y stock. Crea productos con foto en 4 pasos.', '▦');
      await h.tap('.sidebar-nav-item:has-text("Inventario")', { wait: 1200 });
      await h.say('Aquí ves cada producto con su precio al detal, por mayor, costo, margen y stock.', { pos: 'top', wait: 2600 });
      await h.scroll(700, { wait: 1400 });
      await h.scroll(-700, { wait: 700 });
      await h.say('Para crear un producto toca "Nuevo Producto".', { pos: 'middle', wait: 1500 });
      await h.hide();
      await h.tap('button:has-text("Nuevo Producto")', { wait: 1200 });

      await h.say('Paso 1: el nombre y el precio al detal.', { pos: 'top', wait: 1300 });
      await h.type(modal.locator('input.form-input').first(), 'Azúcar 1 kg');
      await h.type(modal.locator('input[type="number"]').first(), '5200');
      await h.say('Tómale una foto con la cámara. La app la optimiza sola para que pese poco.', { pos: 'top', wait: 1600 });
      await h.chooseFile(modal.locator('label:has-text("Tomar foto")'), h.photoPath, { wait: 2600 });
      await next();

      await h.say('Paso 2: ¿cuánto te cuesta? Con eso calculamos tu ganancia.', { pos: 'top', wait: 1500 });
      await h.type(modal.locator('.money-input input').nth(0), '3600');
      await h.say('Escribe también el precio al por mayor.', { pos: 'top', wait: 1200 });
      await modal.locator('.money-input input').nth(2).fill('');
      await h.type(modal.locator('.money-input input').nth(2), '4500');
      await h.say('Ves la ganancia y el margen al detal y al por mayor.', { pos: 'top', wait: 1400 });
      await h.pointAt(modal.locator('.profit-cards'));
      await h.sleep(1800);
      await next();

      await h.say('Paso 3: cuántas unidades tienes y su categoría.', { pos: 'top', wait: 1400 });
      await h.type(modal.locator('input[type="number"]').first(), '24');
      await h.sleep(900);
      await next();

      await h.say('Paso 4: escanea el código de barras del empaque con la cámara.', { pos: 'top', wait: 1400 });
      await h.tap(modal.locator('.scan-btn'), { wait: 300 });
      await page.locator('.scanner-backdrop').waitFor({ state: 'detached', timeout: 15000 });
      await h.sleep(1200);
      await h.pointAt(modal.locator('input[placeholder="Escanear o escribir"]'));
      await h.say('El código quedó guardado. Toca "Crear producto".', { pos: 'top', wait: 1600 });
      await h.tap(modal.getByRole('button', { name: /Crear producto/ }), { wait: 1800 });
      await h.type('.input-with-action .search-input', 'azúcar');
      await h.say('¡Listo! El producto ya está en tu inventario y en la pantalla de ventas.', { pos: 'bottom', wait: 3000 });
    },
  },

  // ------------------------------------------------------------------ Compras
  {
    id: 'compras',
    file: '04-compras',
    title: 'Compras',
    cameraCode: ean13('770123450001'), // Arroz 500 g
    async run(h) {
      const { page } = h;
      const entry = page.locator('.settings-card', { hasText: 'Entrada de Mercancía' });
      const field = label => entry.locator('.form-group', { has: page.locator(`label:text-is("${label}")`) }).locator('input, select').first();

      await h.title('Compras', 'Registra la mercancía que te llega y controla lo que le debes a cada proveedor.', '⇣');
      await h.say('Compras está en el menú "Más".', { pos: 'middle', wait: 1300 });
      await h.hide();
      await openMore(h);
      await h.tap('.more-sheet-row:has-text("Compras")', { wait: 1500 });
      await h.say('Arriba ves tus cuentas por pagar: vencidas y por vencer.', { pos: 'bottom', wait: 2600 });
      await h.pointAt('.dashboard-panel:has-text("Vencidas")');
      await h.sleep(1200);

      await entry.scrollIntoViewIfNeeded();
      await h.sleep(700);
      await h.say('Para registrar mercancía: elige el proveedor y escribe el número de factura.', { pos: 'bottom', wait: 1600 });
      await field('Proveedor').selectOption({ label: 'Distribuidora El Llano' });
      await h.pointAt(field('Proveedor'));
      await h.sleep(700);
      await h.type(field('Factura'), 'FV-2290');
      await h.say('Escanea el producto con la cámara para elegirlo.', { pos: 'bottom', wait: 1300 });
      await h.tap(entry.locator('.scan-btn').first(), { wait: 300 });
      await page.locator('.scanner-backdrop').waitFor({ state: 'detached', timeout: 15000 });
      await h.sleep(1200);
      await h.say('Escribe la cantidad que llegó y cuánto te costó cada una.', { pos: 'bottom', wait: 1300 });
      await h.type(field('Cantidad'), '50');
      await field('Costo').fill('');
      await h.type(field('Costo'), '2300');
      await h.say('Si pagaste una parte, anótala en "Abono". El resto queda como cuenta por pagar.', { pos: 'bottom', wait: 1800 });
      await field('Abono/Pagado').fill('');
      await h.type(field('Abono/Pagado'), '50000');
      await h.tap(entry.getByRole('button', { name: /Registrar compra/ }), { wait: 1800 });
      await h.say('¡Listo! El stock y el costo del producto se actualizan solos.', { pos: 'bottom', wait: 2600 });
      await page.locator('.dashboard-panel', { hasText: 'Compras y Cuentas por Pagar' }).scrollIntoViewIfNeeded();
      await h.sleep(2200);
    },
  },

  // ------------------------------------------------------------------ Ventas
  {
    id: 'ventas',
    file: '05-ventas',
    title: 'Historial de ventas',
    async run(h) {
      const { page } = h;
      await h.title('Ventas', 'Consulta todas tus ventas, filtra por forma de pago o tipo de precio y revisa cada detalle.', '≡');
      await h.tap('.sidebar-nav-item:has-text("Ventas")', { wait: 1500 });
      await h.say('Aquí están todas tus ventas con el total del día.', { pos: 'bottom', wait: 2400 });
      await h.say('Puedes filtrar las ventas al por mayor.', { pos: 'bottom', wait: 1200 });
      await h.tap(page.locator('.filters-row .custom-select-trigger').nth(1), { wait: 800 });
      await h.tap(page.locator('.custom-select-option', { hasText: 'Solo por mayor' }), { wait: 1500 });
      await h.say('Toca una venta para ver qué se vendió.', { pos: 'bottom', wait: 1200 });
      await h.tap(page.locator('.sale-card-header').first(), { wait: 2600 });
      await h.tap(page.locator('.filters-row .custom-select-trigger').nth(1), { wait: 700 });
      await h.tap(page.locator('.custom-select-option', { hasText: 'Detal y por mayor' }), { wait: 1200 });
      await h.say('Las ventas hechas sin internet quedan en el celular y se envían solas al volver la conexión.', { pos: 'bottom', wait: 3200 });
    },
  },

  // ------------------------------------------------------------------ Panel
  {
    id: 'panel',
    file: '06-panel',
    title: 'Panel',
    async run(h) {
      const { page } = h;
      await h.title('Panel', 'Cuánto vendes, cuánto ganas y cómo va tu caja, al detal y al por mayor.', '▤');
      await h.tap('.sidebar-nav-item:has-text("Panel")', { wait: 1800 });
      await h.say('Ventas, ingresos y ganancia del día, en un vistazo.', { pos: 'bottom', wait: 2600 });
      await page.locator('.dashboard-panel', { hasText: 'Detal vs Por mayor' }).scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('Tus cuentas separadas: cuánto vendes y ganas al detal y al por mayor.', { pos: 'bottom', wait: 3000 });
      await page.locator('.dashboard-panel', { hasText: 'Caja' }).first().scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('La caja: con cuánto abriste y cuánto efectivo deberías tener.', { pos: 'bottom', wait: 2800 });
      await page.locator('.dashboard-panel', { hasText: 'Ventas por día' }).scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('Tus ventas de los últimos días y los productos que más se venden.', { pos: 'bottom', wait: 2800 });
      await h.scroll(900, { wait: 2000 });
    },
  },

  // ------------------------------------------------------------------ Menú Más y Configuración
  {
    id: 'configuracion',
    file: '07-mas-y-configuracion',
    title: 'Menú Más y configuración',
    async run(h) {
      const { page } = h;
      await h.title('Más y Configuración', 'Sincronización, tema, datos del negocio, catálogo en línea y cajeros.', '⚙');
      await h.say('Toca "Más" para ver el resto de opciones.', { pos: 'middle', wait: 1300 });
      await h.hide();
      await openMore(h);
      await h.say('Aquí ves si estás en línea, sincronizas ventas, cambias el tema o cierras sesión.', { pos: 'top', wait: 3000 });
      await h.tap('.more-sheet-row:has-text("Configuración")', { wait: 1600 });
      await h.say('En Configuración están los datos de tu negocio y tu cuenta.', { pos: 'bottom', wait: 2400 });
      await page.locator('.settings-card', { hasText: 'Catálogo Público' }).scrollIntoViewIfNeeded();
      await h.sleep(500);
      await h.say('Tu catálogo en línea: el enlace para compartir, el WhatsApp para pedidos y tu logo.', { pos: 'bottom', wait: 3000 });
      await page.locator('.settings-card', { hasText: 'Colaboradores' }).scrollIntoViewIfNeeded();
      await h.sleep(500);
      await h.say('Crea usuarios para tus cajeros: solo pueden vender y ver ventas.', { pos: 'bottom', wait: 3000 });
      await page.locator('.settings-card', { hasText: 'Periféricos' }).scrollIntoViewIfNeeded();
      await h.sleep(500);
      await h.say('Y conecta tu impresora de recibos, cajón y lector de códigos.', { pos: 'bottom', wait: 2800 });
    },
  },

  // ------------------------------------------------------------------ Catálogo público
  {
    id: 'catalogo',
    file: '08-catalogo-en-linea',
    title: 'Catálogo en línea',
    loggedIn: false,
    path: '/tienda-dona-rosa',
    async run(h) {
      const { page } = h;
      await h.title('Catálogo en línea', 'Tus clientes ven tus productos con precio al detal y por mayor, y te piden por WhatsApp.', '◎');
      const card = name => page.locator('.pcat-card', { hasText: name });
      await h.say('Este es el catálogo que compartes con tus clientes: un enlace, sin instalar nada.', { pos: 'bottom', wait: 2800 });
      await page.locator('.pcat-grid').scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('Muestra tus productos con foto, precio y si quedan pocas unidades.', { pos: 'bottom', wait: 2400 });
      await h.say('El cliente toca "Agregar" y ajusta la cantidad.', { pos: 'bottom', wait: 1200 });
      await h.tap(card('Arroz 500 g').locator('.pcat-add'), { wait: 700 });
      await h.tap(card('Arroz 500 g').getByRole('button', { name: /Agregar uno/ }), { wait: 500 });
      await h.tap(card('Aceite 1 L').locator('.pcat-add'), { wait: 900 });
      const mode = page.locator('.pcat-mode-mobile .pcat-mode');
      await mode.scrollIntoViewIfNeeded();
      await h.sleep(400);
      await h.say('Si compra por cantidad, elige "Por mayor" y el pedido se recalcula solo.', { pos: 'bottom', wait: 1400 });
      await h.tap(mode.getByRole('button', { name: 'Por mayor' }), { wait: 1600 });
      await h.say('Toca "Ver pedido" para revisarlo.', { pos: 'middle', wait: 1200 });
      await h.hide();
      await h.tap('.pcat-cartbar', { wait: 1400 });
      await h.pointAt(page.getByRole('button', { name: /Enviar pedido por WhatsApp/ }).last());
      await h.say('Lo envía por WhatsApp y te llega con los productos, el total y el ahorro por mayor.', { pos: 'top', wait: 3200 });
    },
  },
];
