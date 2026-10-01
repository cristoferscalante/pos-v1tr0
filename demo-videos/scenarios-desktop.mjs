// Guiones de la versión de escritorio (1280×800 @1.25): menú lateral y carrito siempre visible.
import { ean13 } from './demo-data.mjs';

const productCard = name => `.product-card:has-text("${name}")`;
const nav = label => `.sidebar-nav-item:has-text("${label}")`;

export const DESKTOP_SCENARIOS = [
  // ------------------------------------------------------------------ Vender
  {
    id: 'vender',
    file: 'escritorio-vender',
    title: 'Vender (escritorio)',
    cameraCode: ean13('770123450007'), // Gaseosa 1.5 L
    async run(h) {
      const { page } = h;
      await h.title('Vender', 'En el computador ves el catálogo y el carrito al mismo tiempo. Cobra al detal o al por mayor.', '$');
      await h.say('Haz clic en un producto para agregarlo. El carrito siempre está a la derecha.');
      await h.tap(productCard('Arroz 500 g'), { wait: 450 });
      await h.tap(productCard('Arroz 500 g'), { wait: 450 });
      await h.tap(productCard('Aceite 1 L'), { wait: 450 });
      await h.tap(productCard('Leche 1 L'), { wait: 900 });

      await h.say('Busca por nombre, SKU o código. También funciona con pistola lectora.');
      await h.type('.pos-catalog-header input', 'café');
      await h.tap(productCard('Café molido'), { wait: 700 });
      await h.clear('.pos-catalog-header input');
      await h.sleep(500);

      await h.say('¿Sin lector? Usa la cámara del computador o del celular.', { wait: 1400 });
      await h.tap('[aria-label="Escanear código con la cámara"]', { wait: 300 });
      await h.hide(0);
      await page.locator('.scanner-backdrop').waitFor({ state: 'detached', timeout: 15000 });
      await h.sleep(1200);

      await h.say('Cambia a "Precios por mayor": los precios y el total se ajustan al instante.', { wait: 1300 });
      await h.tap('role=tab[name="Precios por mayor"]', { wait: 2200 });

      await h.say('Ajusta cantidades con + y –.', { pos: 'top', wait: 900 });
      await h.tap(page.locator('.cart-item').first().locator('.qty-btn').nth(1), { wait: 900 });
      await h.say('Pago en efectivo: toca el billete con que te pagan y ves las vueltas.', { pos: 'top', wait: 1300 });
      await h.tap(page.locator('.cash-quick button', { hasText: '$50.000' }), { wait: 2200 });
      await h.say('Haz clic en "Vender" para registrar la venta.', { pos: 'top', wait: 1000 });
      await h.tap('.btn-checkout', { wait: 2400 });
      await h.say('Imprime el recibo, envíalo por correo o descárgalo como imagen.', { pos: 'top', wait: 3200 });
      await h.tap(page.getByRole('button', { name: 'Nueva Venta' }), { wait: 900 });
      await h.tap('role=tab[name="Precios al detal"]', { wait: 900 });
    },
  },

  // ------------------------------------------------------------------ Inventario
  {
    id: 'inventario',
    file: 'escritorio-inventario',
    title: 'Inventario (escritorio)',
    cameraCode: ean13('770123450009'),
    async run(h) {
      const { page } = h;
      const modal = page.locator('.modal-box');
      const next = () => h.tap(modal.getByRole('button', { name: /Siguiente/ }), { wait: 1000 });

      await h.title('Inventario', 'Todos tus productos con precio al detal, por mayor, costo, margen y stock.', '▦');
      await h.tap(nav('Inventario'), { wait: 1400 });
      await h.say('En la tabla ves cada producto con sus dos precios, el costo, el margen y el stock.', { wait: 2600 });
      await h.scroll(500, { wait: 1300 });
      await h.scroll(-500, { wait: 700 });
      await h.say('Busca un producto escribiendo o escaneando su código.', { wait: 1200 });
      await h.type('.input-with-action .search-input', 'leche');
      await h.sleep(1200);
      await h.clear('.input-with-action .search-input');
      await h.sleep(600);

      await h.say('Para crear uno, haz clic en "Nuevo Producto".', { wait: 1100 });
      await h.tap('button:has-text("Nuevo Producto")', { wait: 1200 });
      await h.say('Paso 1: nombre, precio al detal y foto.', { pos: 'top', wait: 1100 });
      await h.type(modal.locator('input.form-input').first(), 'Azúcar 1 kg');
      await h.type(modal.locator('input[type="number"]').first(), '5200');
      await h.chooseFile(modal.locator('label:has-text("Galería")'), h.photoPath, { wait: 2200 });
      await next();

      await h.say('Paso 2: tu costo y el precio por mayor. La ganancia se calcula sola.', { pos: 'top', wait: 1300 });
      await h.type(modal.locator('.money-input input').nth(0), '3600');
      await modal.locator('.money-input input').nth(2).fill('');
      await h.type(modal.locator('.money-input input').nth(2), '4500');
      await h.pointAt(modal.locator('.profit-cards'));
      await h.sleep(2000);
      await next();

      await h.say('Paso 3: unidades en stock.', { pos: 'top', wait: 900 });
      await h.type(modal.locator('input[type="number"]').first(), '24');
      await next();

      await h.say('Paso 4: escanea el código de barras y crea el producto.', { pos: 'top', wait: 1100 });
      await h.tap(modal.locator('.scan-btn'), { wait: 300 });
      await page.locator('.scanner-backdrop').waitFor({ state: 'detached', timeout: 15000 });
      await h.sleep(1000);
      await h.tap(modal.getByRole('button', { name: /Crear producto/ }), { wait: 1800 });
      await h.type('.input-with-action .search-input', 'azúcar');
      await h.say('¡Listo! Ya está en tu inventario y en la pantalla de ventas.', { wait: 2800 });
    },
  },

  // ------------------------------------------------------------------ Panel
  {
    id: 'panel',
    file: 'escritorio-panel',
    title: 'Panel (escritorio)',
    async run(h) {
      const { page } = h;
      await h.title('Panel', 'Cuánto vendes, cuánto ganas y cómo va tu caja, al detal y al por mayor.', '▤');
      await h.tap(nav('Dashboard'), { wait: 1800 });
      await h.say('Ventas, ingresos, ganancia y ticket promedio del día.', { wait: 2600 });
      await page.locator('.dashboard-panel', { hasText: 'Detal vs Por mayor' }).scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('Tus cuentas separadas entre detal y por mayor.', { wait: 2800 });
      await page.locator('.dashboard-panel', { hasText: 'Caja' }).first().scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('La caja del día: base, ventas en efectivo y lo que deberías tener.', { wait: 2800 });
      await page.locator('.dashboard-panel', { hasText: 'Ventas por día' }).scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('Ventas de los últimos días y productos más vendidos.', { wait: 2600 });
      await h.scroll(700, { wait: 1800 });

      await h.say('En "Ventas" consultas cada venta y filtras por tipo de precio.', { wait: 1400 });
      await h.tap(nav('Ventas'), { wait: 1600 });
      await h.tap(page.locator('.filters-row .custom-select-trigger').nth(1), { wait: 800 });
      await h.tap(page.locator('.custom-select-option', { hasText: 'Solo por mayor' }), { wait: 1600 });
      await h.tap(page.locator('.sale-card-header').first(), { wait: 2800 });
    },
  },

  // ------------------------------------------------------------------ Catálogo público
  {
    id: 'catalogo',
    file: 'escritorio-catalogo',
    title: 'Catálogo en línea (escritorio)',
    loggedIn: false,
    path: '/tienda-dona-rosa',
    async run(h) {
      const { page } = h;
      const card = name => page.locator('.pcat-card', { hasText: name });
      await h.title('Catálogo en línea', 'Tus clientes ven tus productos desde cualquier computador o celular y te piden por WhatsApp.', '◎');
      await h.say('Este es el catálogo que compartes con un enlace.', { wait: 2200 });
      await page.locator('.pcat-grid').scrollIntoViewIfNeeded();
      await h.sleep(600);
      await h.say('El cliente agrega productos y ajusta la cantidad.', { wait: 1200 });
      await h.tap(card('Arroz 500 g').locator('.pcat-add'), { wait: 700 });
      await h.tap(card('Arroz 500 g').getByRole('button', { name: /Agregar uno/ }), { wait: 500 });
      await h.tap(card('Aceite 1 L').locator('.pcat-add'), { wait: 700 });
      await h.tap(card('Leche 1 L').locator('.pcat-add'), { wait: 900 });
      await h.say('Si compra por cantidad elige "Por mayor" y todo se recalcula.', { pos: 'top', wait: 1300 });
      await h.tap(page.locator('.pcat-mode').first().getByRole('button', { name: 'Por mayor' }), { wait: 1800 });
      await h.say('Revisa el pedido…', { pos: 'top', wait: 900 });
      await h.tap('.pcat-cart-btn', { wait: 1500 });
      await h.pointAt(page.getByRole('button', { name: /Enviar pedido por WhatsApp/ }).last());
      await h.say('…y te llega por WhatsApp con los productos, el total y el ahorro por mayor.', { pos: 'top', wait: 3200 });
    },
  },
];
