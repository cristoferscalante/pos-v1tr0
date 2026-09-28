# Videos demostrativos del POS

Graba un video vertical de celular (780×1688, MP4) por cada módulo de la app, con subtítulos
paso a paso y un círculo amarillo donde se toca. Usa Playwright: un navegador de celular
recorre la app solo, siguiendo los guiones de `scenarios.mjs`.

Los videos usan un **negocio ficticio** ("Tienda Doña Rosa") con una API simulada
(`demo-data.mjs`), así que no tocan producción ni datos de clientes.

## Cómo grabar

1. Levanta el frontend: `npm run dev` dentro de `frontend/` (puerto 5173).
2. En esta carpeta:

```bash
npm install
node record.mjs                 # todos los módulos
node record.mjs vender panel    # solo algunos
```

Los MP4 quedan en `output/`. Para grabar contra otra URL: `POS_URL=http://... node record.mjs`.

## Módulos

| id | archivo | contenido |
|---|---|---|
| `ingreso` | 01-ingreso | Iniciar sesión |
| `vender` | 02-vender | Agregar productos, buscar, escanear con la cámara, detal/por mayor, carrito, cobro y recibo |
| `inventario` | 03-inventario | Lista, alta de producto en 4 pasos con foto, costo, dos precios y escaneo del código |
| `compras` | 04-compras | Cuentas por pagar y entrada de mercancía (escaneando el producto) |
| `ventas` | 05-ventas | Historial, filtro por mayor y detalle de una venta |
| `panel` | 06-panel | Indicadores, detal vs por mayor, caja y gráficos |
| `configuracion` | 07-mas-y-configuracion | Menú Más y configuración del negocio |
| `catalogo` | 08-catalogo-en-linea | Catálogo público con ambos precios y pedido por WhatsApp |

## Cómo funciona

- **Cámara:** Chromium usa una cámara falsa (`--use-file-for-fake-video-capture`) con un video
  generado en `assets.mjs`: una etiqueta con un código EAN-13 real (bwip-js) que entra al cuadro.
  El escáner de la app lo lee de verdad. Cada guion elige el código con `cameraCode`.
- **Foto del producto:** el botón "Tomar foto" recibe `assets/foto-azucar.jpg` por el selector
  de archivos; la app la comprime a WebP como en un celular.
- **Subtítulos y toques:** `overlay.mjs` se inyecta en la página y no recibe clics.
- Para cambiar textos o pasos, edita `scenarios.mjs` (`say` = subtítulo, `tap` = toque,
  `type` = escribir).
