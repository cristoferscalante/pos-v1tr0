// Negocio ficticio para los videos y API simulada (page.route): nada toca producción.
import { randomUUID } from 'node:crypto';

export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'rosa@tiendademo.co',
  role: 'admin',
  is_superadmin: false,
  tenant_id: TENANT_ID,
  business_name: 'Tienda Doña Rosa',
  business_type: 'otro',
  slug: 'tienda-dona-rosa',
  meta_data: {
    display_name: 'Tienda Doña Rosa',
    brand_color: '#4f46e5',
    whatsapp_number: '+573001234567',
    product_categories: ['Abarrotes', 'Bebidas', 'Lácteos', 'Aseo'],
  },
};

// EAN-13 con dígito de control válido
export function ean13(base12) {
  const digits = base12.split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

// Ilustración simple (SVG) para cada producto, como si fuera la foto
function productArt(label, bg, fg, shape) {
  const shapes = {
    bag: `<path d="M70 70 h100 l14 150 h-128z" fill="${fg}" opacity="0.95"/><rect x="82" y="120" width="76" height="46" rx="8" fill="#fff" opacity="0.9"/>`,
    bottle: `<rect x="100" y="40" width="40" height="30" rx="6" fill="${fg}"/><path d="M92 70 h56 q14 20 14 50 v90 q0 14 -14 14 h-56 q-14 0 -14 -14 v-90 q0 -30 14 -50z" fill="${fg}" opacity="0.95"/><rect x="88" y="130" width="64" height="44" rx="8" fill="#fff" opacity="0.9"/>`,
    box: `<rect x="62" y="70" width="116" height="140" rx="10" fill="${fg}" opacity="0.95"/><rect x="76" y="118" width="88" height="46" rx="8" fill="#fff" opacity="0.9"/>`,
    eggs: `<rect x="50" y="130" width="140" height="70" rx="12" fill="${fg}"/>${[70, 105, 140, 175].map(x => `<ellipse cx="${x - 8}" cy="122" rx="15" ry="20" fill="#fff7ed"/>`).join('')}`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="24" fill="${bg}"/>${shapes[shape]}<text x="120" y="${shape === 'eggs' ? 232 : 150}" font-family="Arial" font-weight="700" font-size="${shape === 'eggs' ? 20 : 16}" text-anchor="middle" fill="#1f2937">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const P = (name, sku, code, price, wholesale, cost, stock, category, art) => ({
  id: randomUUID(), tenant_id: TENANT_ID, name, sku, barcode: ean13(code),
  price: price.toFixed(2), wholesale_price: wholesale.toFixed(2), cost: cost.toFixed(2),
  stock, category, tax_rate: '0.00', image: art, is_archived: false,
  meta_data: { tipo: category },
});

export function createStore() {
  const products = [
    P('Arroz 500 g', 'ARR-500', '770123450001', 3500, 2900, 2200, 48, 'Abarrotes', productArt('ARROZ', '#fde68a', '#f59e0b', 'bag')),
    P('Aceite 1 L', 'ACE-1L', '770123450002', 12000, 10500, 8800, 14, 'Abarrotes', productArt('ACEITE', '#fef3c7', '#eab308', 'bottle')),
    P('Café molido 250 g', 'CAF-250', '770123450003', 9500, 8200, 6500, 20, 'Abarrotes', productArt('CAFÉ', '#e7d3c1', '#78350f', 'bag')),
    P('Panela 500 g', 'PAN-500', '770123450004', 4000, 3300, 2500, 4, 'Abarrotes', productArt('PANELA', '#fed7aa', '#c2410c', 'box')),
    P('Huevos x30', 'HUE-30', '770123450005', 18000, 16000, 13500, 10, 'Lácteos', productArt('HUEVOS', '#fef9c3', '#a16207', 'eggs')),
    P('Leche 1 L', 'LEC-1L', '770123450006', 4200, 3800, 3000, 36, 'Lácteos', productArt('LECHE', '#dbeafe', '#2563eb', 'box')),
    P('Gaseosa 1.5 L', 'GAS-15', '770123450007', 6000, 5200, 4000, 24, 'Bebidas', productArt('GASEOSA', '#fecaca', '#dc2626', 'bottle')),
    P('Jabón en barra', 'JAB-01', '770123450008', 3000, 2500, 1800, 0, 'Aseo', productArt('JABÓN', '#d1fae5', '#059669', 'box')),
  ];

  const now = Date.now();
  const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
  const line = (p, qty, mode) => {
    const price = Number(mode === 'wholesale' ? p.wholesale_price : p.price);
    return { product_id: p.id, name: p.name, quantity: qty, price, total: price * qty, price_mode: mode, unit_cost: Number(p.cost) };
  };
  let seq = 1040;
  const makeSale = (minsAgo, method, mode, lines) => {
    const total = lines.reduce((s, l) => s + l.total, 0);
    return {
      id: randomUUID(), sale_number: `POS-0${++seq}`, subtotal: total, tax: 0, total,
      payment_method: method, created_at: iso(minsAgo), tenant_id: TENANT_ID, user_id: USER.id,
      meta_data: { price_mode: mode }, details: lines,
    };
  };
  const [arroz, aceite, cafe, panela, huevos, leche, gaseosa] = products;
  const sales = [
    makeSale(300, 'cash', 'retail', [line(arroz, 2, 'retail'), line(leche, 1, 'retail')]),
    makeSale(240, 'transfer', 'wholesale', [line(aceite, 12, 'wholesale'), line(arroz, 25, 'wholesale')]),
    makeSale(180, 'card', 'retail', [line(cafe, 1, 'retail'), line(huevos, 1, 'retail')]),
    makeSale(95, 'cash', 'retail', [line(gaseosa, 2, 'retail'), line(panela, 1, 'retail')]),
    makeSale(40, 'cash', 'wholesale', [line(huevos, 6, 'wholesale')]),
  ].reverse();

  const suppliers = [
    { id: randomUUID(), tenant_id: TENANT_ID, name: 'Distribuidora El Llano', contact_name: 'Carlos Pérez', phone: '3105550101', payment_terms_days: 30, is_active: true, created_at: iso(9000) },
    { id: randomUUID(), tenant_id: TENANT_ID, name: 'Lácteos La Pradera', contact_name: 'Marta Gómez', phone: '3115550202', payment_terms_days: 15, is_active: true, created_at: iso(8000) },
  ];
  const purchase = (supplier, invoice, daysAgo, dueInDays, total, paid, lines) => ({
    id: randomUUID(), tenant_id: TENANT_ID, supplier_id: supplier.id, supplier_name: supplier.name, user_id: USER.id,
    invoice_number: invoice, subtotal: total, tax: 0, total, paid_amount: paid, balance_due: total - paid,
    status: 'posted', due_date: new Date(now + dueInDays * 86400000).toISOString().slice(0, 10),
    created_at: iso(daysAgo * 1440), details: lines, payments: [],
  });
  const purchases = [
    purchase(suppliers[0], 'FV-2231', 3, 27, 440000, 200000, [{ product_id: arroz.id, name: arroz.name, quantity: 200, unit_cost: 2200, total_cost: 440000 }]),
    purchase(suppliers[1], 'LP-0932', 20, -5, 300000, 0, [{ product_id: leche.id, name: leche.name, quantity: 100, unit_cost: 3000, total_cost: 300000 }]),
  ];
  const movements = [
    { id: randomUUID(), tenant_id: TENANT_ID, product_id: arroz.id, user_id: USER.id, movement_type: 'purchase', quantity: 200, previous_stock: 10, new_stock: 210, unit_cost: 2200, created_at: iso(4320) },
    { id: randomUUID(), tenant_id: TENANT_ID, product_id: arroz.id, user_id: USER.id, movement_type: 'sale', quantity: -25, previous_stock: 210, new_stock: 185, created_at: iso(240) },
  ];
  const media = new Map();
  const tenant = {
    id: TENANT_ID, name: USER.business_name, slug: USER.slug, business_type: USER.business_type,
    plan_name: 'premium', is_active: true, has_electronic_billing: false, folios_remaining: 0, folios_total: 0,
    whatsapp_number: USER.meta_data.whatsapp_number, meta_data: { ...USER.meta_data },
  };
  return { products, sales, suppliers, purchases, movements, media, tenant, seq: () => ++seq };
}

function summary(store) {
  const today = store.sales;
  const agg = (mode) => {
    const r = { count: 0, revenue: 0, profit: 0 };
    for (const s of today) {
      const ls = s.details.filter(d => (d.price_mode || 'retail') === mode);
      if (!ls.length) continue;
      r.count += 1;
      for (const d of ls) { r.revenue += d.total; r.profit += d.total - (d.unit_cost || 0) * d.quantity; }
    }
    return r;
  };
  const retail = agg('retail');
  const wholesale = agg('wholesale');
  const revenue = retail.revenue + wholesale.revenue;
  const profit = retail.profit + wholesale.profit;
  const scale = (o, k) => ({ count: o.count * k, revenue: o.revenue * k, profit: o.profit * k });
  return {
    counts: { today: today.length, week: today.length * 5, month: today.length * 21 },
    revenue: { today: revenue, week: revenue * 5, month: revenue * 21 },
    profit: { today: profit, week: profit * 5, month: profit * 21 },
    avg_ticket: Math.round(revenue / Math.max(1, today.length)),
    low_stock_count: store.products.filter(p => p.stock < 5).length,
    low_stock_products: store.products.filter(p => p.stock < 5).map(p => ({ id: p.id, name: p.name, stock: p.stock })),
    payment_breakdown: { cash: 62, card: 21, transfer: 17 },
    by_price_mode: {
      today: { retail, wholesale },
      month: { retail: scale(retail, 21), wholesale: scale(wholesale, 21) },
    },
  };
}

const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

/** Instala la API simulada en la página. */
export async function mockApi(page, store) {
  await page.route('**/api-proxy/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api-proxy/, '');
    const method = req.method();
    const body = () => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } };

    // Fotos subidas durante la grabación
    if (path.startsWith('/media/') && method === 'GET') {
      const file = store.media.get(path);
      return file ? route.fulfill({ status: 200, contentType: file.type, body: file.data }) : route.fulfill({ status: 404 });
    }
    if (path === '/api/v1/media/products' && method === 'POST') {
      const buf = req.postDataBuffer() || Buffer.alloc(0);
      const isWebp = buf.includes(Buffer.from('WEBP'));
      const start = buf.indexOf(isWebp ? Buffer.from('RIFF') : Buffer.from([0xff, 0xd8, 0xff]));
      const boundaryEnd = buf.lastIndexOf(Buffer.from('\r\n--'));
      const data = buf.subarray(start, boundaryEnd > start ? boundaryEnd : undefined);
      const p = `/media/${TENANT_ID}/${randomUUID().replace(/-/g, '')}.${isWebp ? 'webp' : 'jpg'}`;
      store.media.set(p, { type: isWebp ? 'image/webp' : 'image/jpeg', data });
      return json(route, { path: p, bytes: data.length }, 201);
    }

    if (path === '/api/v1/auth/login') return json(route, { access_token: 'demo-token', token_type: 'bearer', user: USER });
    if (path === '/api/v1/auth/tenant') {
      if (method === 'PUT') Object.assign(store.tenant.meta_data, body());
      return json(route, store.tenant);
    }
    if (path === '/api/v1/auth/collaborators') {
      return json(route, [{ id: randomUUID(), email: 'caja1@tiendademo.co', role: 'cashier', is_active: true, tenant_id: TENANT_ID }]);
    }
    if (path.startsWith('/api/v1/auth/notifications')) return json(route, []);
    if (path === '/api/v1/purchases/notification-logs') return json(route, []);

    if (path.startsWith('/api/v1/products/public/')) {
      return json(route, {
        tenant: { name: store.tenant.name, business_type: store.tenant.business_type, slug: store.tenant.slug, meta_data: store.tenant.meta_data },
        products: store.products.filter(p => !p.is_archived).map(({ cost, ...p }) => p),
      });
    }
    if (path === '/api/v1/products/' && method === 'GET') return json(route, store.products);
    if (path === '/api/v1/products/' && method === 'POST') {
      const p = { ...body(), tenant_id: TENANT_ID };
      store.products.push(p);
      return json(route, p, 201);
    }
    const prodMatch = path.match(/^\/api\/v1\/products\/([^/]+)$/);
    if (prodMatch && method === 'PUT') {
      const p = store.products.find(x => x.id === prodMatch[1]);
      if (p) Object.assign(p, body(), { stock: p.stock });
      return json(route, p || {});
    }

    if (path === '/api/v1/sales/sync') {
      const { sales } = body();
      for (const s of sales) {
        store.sales.unshift({ ...s, sale_number: `POS-0${store.seq()}`, tenant_id: TENANT_ID, user_id: USER.id });
        for (const d of s.details) {
          const p = store.products.find(x => x.id === d.product_id);
          if (p) p.stock -= d.quantity;
        }
      }
      return json(route, { status: 'success', synced_ids: sales.map(s => s.id), errors: [] });
    }
    if (path === '/api/v1/sales/') return json(route, store.sales);
    const saleMatch = path.match(/^\/api\/v1\/sales\/([^/]+)$/);
    if (saleMatch) return json(route, store.sales.find(s => s.id === saleMatch[1]) || {}, 200);

    if (path === '/api/v1/dashboard/summary') return json(route, summary(store));
    if (path === '/api/v1/dashboard/chart') {
      const days = Number(url.searchParams.get('days') || 7);
      const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      return json(route, Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
        label: labels[i % 7], count: 18 + ((i * 7) % 11), revenue: 480000 + ((i * 97000) % 420000),
      })));
    }
    if (path === '/api/v1/dashboard/top-products') {
      return json(route, store.products.slice(0, 5).map((p, i) => ({ product_id: p.id, name: p.name, quantity_sold: 120 - i * 18, revenue: (120 - i * 18) * Number(p.price) })));
    }
    if (path === '/api/v1/cash/current') {
      return json(route, {
        session: { id: 'caja-1', tenant_id: TENANT_ID, opened_by_user_id: USER.id, opening_amount: 150000, status: 'open', opened_at: new Date(Date.now() - 6 * 3600000).toISOString() },
        sales_count: store.sales.length, sales_total: store.sales.reduce((s, x) => s + Number(x.total), 0), expected_amount: 150000 + 186000,
      });
    }
    if (path.startsWith('/api/v1/cash')) return json(route, []);

    if (path === '/api/v1/suppliers/' && method === 'GET') return json(route, store.suppliers);
    if (path === '/api/v1/suppliers/' && method === 'POST') {
      const s = { id: randomUUID(), tenant_id: TENANT_ID, is_active: true, created_at: new Date().toISOString(), payment_terms_days: 0, ...body() };
      store.suppliers.push(s);
      return json(route, s, 201);
    }
    if (path === '/api/v1/purchases/accounts-payable/summary') {
      const today = new Date().toISOString().slice(0, 10);
      const open = store.purchases.filter(p => p.balance_due > 0);
      return json(route, {
        total_balance: open.reduce((s, p) => s + p.balance_due, 0),
        overdue_count: open.filter(p => p.due_date < today).length,
        upcoming_count: open.filter(p => p.due_date >= today).length,
        overdue: open.filter(p => p.due_date < today),
        upcoming: open.filter(p => p.due_date >= today),
      });
    }
    if (path === '/api/v1/purchases/movements') return json(route, store.movements);
    if (/\/kardex$/.test(path)) {
      const pid = path.split('/').slice(-2)[0];
      return json(route, store.movements.filter(m => m.product_id === pid));
    }
    if (path === '/api/v1/purchases/' && method === 'POST') {
      const b = body();
      const supplier = store.suppliers.find(s => s.id === b.supplier_id) || store.suppliers[0];
      const details = (b.details || []).map(l => {
        const p = store.products.find(x => x.id === l.product_id);
        if (p) { p.stock += l.quantity; p.cost = Number(l.unit_cost).toFixed(2); }
        return { ...l, name: p?.name, total_cost: l.quantity * l.unit_cost };
      });
      const total = details.reduce((s, l) => s + l.total_cost, 0) + Number(b.tax || 0);
      const created = {
        id: randomUUID(), tenant_id: TENANT_ID, supplier_id: supplier.id, supplier_name: supplier.name, user_id: USER.id,
        invoice_number: b.invoice_number, subtotal: total, tax: Number(b.tax || 0), total, paid_amount: Number(b.paid_amount || 0),
        balance_due: total - Number(b.paid_amount || 0), status: 'posted', due_date: b.due_date, created_at: new Date().toISOString(), details, payments: [],
      };
      store.purchases.unshift(created);
      return json(route, created, 201);
    }
    if (path.startsWith('/api/v1/purchases')) return json(route, store.purchases);

    console.warn('  [api sin simular]', method, path);
    return json(route, {}, 404);
  });
}
