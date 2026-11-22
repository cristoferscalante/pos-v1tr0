/**
 * Blog estático de V1TR0 POS.
 *
 * La landing es una SPA: Google y los asistentes de IA ven un <div id="root"> vacío.
 * Este script convierte content/blog/*.md en HTML completo (sin JavaScript) dentro de dist/,
 * con datos estructurados, sitemap, RSS, robots.txt y llms.txt. Corre después de `vite build`.
 *
 *   node scripts/build-blog.mjs            -> publica solo los artículos sin `draft: true`
 *   BLOG_DRAFTS=1 node scripts/build-blog.mjs   -> incluye borradores (vista previa local)
 */
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { marked } from 'marked'
import sharp from 'sharp'

/**
 * Optimización automática de portadas: por cada imagen de content se generan versiones de
 * 480, 800 y 1200 px en AVIF y WebP (dist/blog/img/opt/), recortadas a 1200×630, para que cada
 * dispositivo descargue solo el tamaño que necesita. La imagen original queda para Open Graph.
 */
const ANCHOS = [480, 800, 1200]
const IMG = new Map()
async function optimizarPortada(cover) {
  if (!cover || cover.startsWith('http') || IMG.has(cover)) return
  const origen = path.join(ROOT, 'public', cover.replace(/^\//, ''))
  if (!fs.existsSync(origen)) return
  const base = path.basename(cover).replace(/\.[a-z0-9]+$/i, '')
  const salida = path.join(ROOT, 'dist', 'blog', 'img', 'opt')
  fs.mkdirSync(salida, { recursive: true })
  const srcset = { avif: [], webp: [] }
  for (const w of ANCHOS) {
    const h = Math.round((w * 630) / 1200)
    const img = sharp(origen).resize(w, h, { fit: 'cover', position: 'centre' })
    await img.clone().avif({ quality: 55, effort: 4 }).toFile(path.join(salida, `${base}-${w}.avif`))
    await img.clone().webp({ quality: 80 }).toFile(path.join(salida, `${base}-${w}.webp`))
    srcset.avif.push(`/blog/img/opt/${base}-${w}.avif ${w}w`)
    srcset.webp.push(`/blog/img/opt/${base}-${w}.webp ${w}w`)
  }
  IMG.set(cover, { avif: srcset.avif.join(', '), webp: srcset.webp.join(', '), fallback: `/blog/img/opt/${base}-800.webp` })
}

/** <picture> responsivo con AVIF, WebP y tamaño fijo (sin saltos de diseño al cargar). */
function picture(cover, alt, { cls = '', sizes = '100vw', lazy = true } = {}) {
  const o = IMG.get(cover)
  const attrs = `alt="${esc(alt)}" width="1200" height="630"${cls ? ` class="${cls}"` : ''} decoding="async" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'}`
  if (!o) return `<img src="${esc(cover)}" ${attrs}>`
  return `<picture><source type="image/avif" srcset="${o.avif}" sizes="${sizes}"><source type="image/webp" srcset="${o.webp}" sizes="${sizes}">` +
    `<img src="${o.fallback}" ${attrs}></picture>`
}

const SITE = 'https://pos.v1tr0.com'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const SRC = path.join(ROOT, 'content', 'blog')
const DIST = path.join(ROOT, 'dist')
const DRAFTS = process.env.BLOG_DRAFTS === '1'
const TELEGRAM = 'https://t.me/V1tr0'
const CORREO = 'buzon@v1tr0.com'
/** Telegram con el mensaje ya escrito (t.me/<usuario>?text=) y correo con asunto listo. */
const tg = (texto) => `${TELEGRAM}?text=${encodeURIComponent(texto)}`
const correo = (asunto, cuerpo = '') => `mailto:${CORREO}?subject=${encodeURIComponent(asunto)}${cuerpo ? `&body=${encodeURIComponent(cuerpo)}` : ''}`
const ORG = {
  '@type': 'Organization', name: 'V1TR0', url: 'https://v1tr0.com',
  logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` },
  sameAs: ['https://v1tr0.com', TELEGRAM],
}
const APP = {
  '@type': 'SoftwareApplication', name: 'V1TR0 POS', url: SITE, applicationCategory: 'BusinessApplication',
  operatingSystem: 'Android, iOS, Windows, macOS (navegador)',
  offers: { '@type': 'Offer', price: '39900', priceCurrency: 'COP', description: 'Plan Estándar mensual; prueba gratis 7 días' },
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const fecha = (d) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const iso = (d) => new Date(`${d}T12:00:00-05:00`).toISOString()
const jsonld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`

// Encabezados con id para el índice y enlaces profundos
const renderer = new marked.Renderer()
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens)
  const id = slugify(text.replace(/<[^>]+>/g, ''))
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}
renderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens)
  const externo = /^https?:\/\//.test(href) && !href.startsWith(SITE)
  return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${externo ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`
}
renderer.table = function (token) {
  const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('')
  const body = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('')
  return `<div class="tabla"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}
marked.use({ renderer, gfm: true })

function leer() {
  if (!fs.existsSync(SRC)) return []
  return fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(SRC, f), 'utf8'))
      const slug = f.replace(/\.md$/, '')
      const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date)
      const updated = data.updated ? (data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated)) : date
      const palabras = content.split(/\s+/).length
      return { ...data, slug, date, updated, content, minutos: Math.max(1, Math.round(palabras / 200)), url: `${SITE}/blog/${slug}/` }
    })
    .filter((p) => DRAFTS || p.draft !== true)
    .sort((a, b) => b.date.localeCompare(a.date))
}

const CSS = `
:root{--bg:#070b12;--bg2:#0d1117;--card:#111827;--line:#1f2937;--txt:#e5e7eb;--muted:#9ca3af;--ind:#6366f1;--cyan:#22d3ee;--tg:#229ED9}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:17px/1.7 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
a{color:var(--cyan)}img{max-width:100%;height:auto}
.top{position:sticky;top:0;z-index:5;background:rgba(7,11,18,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.top .in{max-width:1080px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px}
.marca{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:800;font-size:18px}
.marca img{width:34px;height:34px}.top nav{margin-left:auto;display:flex;gap:16px;align-items:center}
.top nav a{color:var(--muted);text-decoration:none;font-weight:600;font-size:15px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;font-weight:700;text-decoration:none;color:#fff!important;background:linear-gradient(135deg,var(--ind),var(--cyan))}
.btn.tg{background:var(--tg)}
main{max-width:760px;margin:0 auto;padding:28px 20px 40px}
.migas{font-size:14px;color:var(--muted)}.migas a{color:var(--muted)}
h1{font-size:clamp(30px,5vw,42px);line-height:1.15;margin:14px 0 12px;color:#fff;letter-spacing:-.01em}
.meta{color:var(--muted);font-size:14px;display:flex;flex-wrap:wrap;gap:6px 14px}
.portada{display:block;width:100%;height:auto;object-fit:cover;aspect-ratio:1200/630;border-radius:16px;margin:22px 0;border:1px solid var(--line)}
.corta{background:linear-gradient(135deg,rgba(99,102,241,.16),rgba(34,211,238,.08));border:1px solid rgba(99,102,241,.45);border-radius:14px;padding:16px 20px;margin:8px 0 26px}
.corta b{display:block;color:var(--cyan);font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
.corta p{margin:0}
article h2{color:#fff;font-size:27px;line-height:1.25;margin:40px 0 10px}article h3{color:#fff;font-size:21px;margin:28px 0 8px}
article blockquote{margin:22px 0;padding:6px 18px;border-left:4px solid var(--cyan);background:var(--bg2);border-radius:0 10px 10px 0;color:#d1d5db}
article code{background:var(--bg2);padding:2px 6px;border-radius:6px;font-size:.9em}
article pre{background:var(--bg2);padding:14px;border-radius:10px;overflow:auto}
.tabla{overflow-x:auto;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:15px}
th{background:var(--card);color:#fff;text-align:left}th,td{padding:10px 12px;border:1px solid var(--line);vertical-align:top}
.faq{margin-top:44px}.faq details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:10px 0}
.faq summary{cursor:pointer;font-weight:700;color:#fff}.faq details p{margin:10px 0 0;color:#d1d5db}
.cta{margin:44px 0 10px;padding:26px;border-radius:18px;text-align:center;background:linear-gradient(135deg,rgba(99,102,241,.3),rgba(34,211,238,.14));border:1px solid rgba(99,102,241,.5)}
.cta h2{margin:0 0 6px;color:#fff;font-size:24px}.cta p{color:#d1d5db;margin:0 0 16px}.cta .bs{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.rel{margin-top:40px}.rel h2{font-size:22px;color:#fff}
.lista{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--txt);display:flex;flex-direction:column}
.card img{display:block;aspect-ratio:1200/630;object-fit:cover;width:100%;height:auto}.card div{padding:14px 16px}
.card h3{margin:6px 0;color:#fff;font-size:19px;line-height:1.3}.card p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
.card small{color:var(--cyan);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
.wide{max-width:1080px}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:14px}footer .in{max-width:1080px;margin:0 auto;padding:22px 20px;display:flex;flex-wrap:wrap;gap:10px 18px}
footer a{color:var(--muted)}
@media(max-width:640px){.top nav a.x{display:none}body{font-size:16.5px}}
`

const head = ({ title, desc, url, image, type = 'website', extra = '', robots = 'index,follow' }) => `<!doctype html>
<html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta name="robots" content="${robots},max-image-preview:large">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="V1TR0 POS"><meta property="og:locale" content="es_CO">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="alternate" type="application/rss+xml" title="Blog V1TR0 POS" href="${SITE}/blog/feed.xml">
<meta name="theme-color" content="#070b12"><style>${CSS}</style>${extra}</head><body>
<header class="top"><div class="in"><a class="marca" href="/"><img src="/logo.svg" alt="" width="34" height="34">V1TR0 POS</a>
<nav><a class="x" href="/blog/">Blog</a><a class="x" href="/#planes">Planes</a><a class="btn" href="/registro">Prueba gratis</a></nav></div></header>`

const foot = `<footer><div class="in"><span>© ${new Date().getFullYear()} V1TR0 · Punto de venta para negocios en Colombia</span>
<a href="/">Inicio</a><a href="/blog/">Blog</a><a href="/registro">Crear cuenta</a><a href="${tg('Hola, quiero información sobre V1TR0 POS para mi negocio.')}" rel="noopener">Telegram @V1tr0</a><a href="${correo('Información sobre V1TR0 POS')}">${CORREO}</a></div></footer></body></html>`

const card = (p) => `<a class="card" href="/blog/${p.slug}/">${picture(p.cover, p.title, { sizes: '(max-width: 700px) 100vw, 360px' })}
<div><small>${esc(p.category || 'Negocio')}</small><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p></div></a>`

function paginaPost(p, todos) {
  const image = p.cover.startsWith('http') ? p.cover : SITE + p.cover
  const relacionados = todos.filter((o) => o.slug !== p.slug)
    .map((o) => ({ o, s: (o.category === p.category ? 2 : 0) + (o.tags || []).filter((t) => (p.tags || []).includes(t)).length }))
    .sort((a, b) => b.s - a.s || b.o.date.localeCompare(a.o.date)).slice(0, 3).map((x) => x.o)
  const faqs = p.faqs || []
  const ld = [
    jsonld({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description, image: [image],
      datePublished: iso(p.date), dateModified: iso(p.updated), inLanguage: 'es-CO', mainEntityOfPage: p.url,
      author: { '@type': 'Person', name: p.author || 'Equipo V1TR0', url: 'https://v1tr0.com' }, publisher: ORG,
      keywords: (p.tags || []).join(', '), articleSection: p.category, about: APP, wordCount: p.content.split(/\s+/).length }),
    jsonld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'V1TR0 POS', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: p.title, item: p.url }] }),
    faqs.length ? jsonld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({
      '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) : '',
  ].join('')
  const extra = `<meta property="article:published_time" content="${iso(p.date)}"><meta property="article:modified_time" content="${iso(p.updated)}">${ld}`
  return head({ title: `${p.title} | V1TR0 POS`, desc: p.description, url: p.url, image, type: 'article', extra, robots: p.draft ? 'noindex,nofollow' : 'index,follow' }) + `
<main><nav class="migas"><a href="/">Inicio</a> › <a href="/blog/">Blog</a> › ${esc(p.category || 'Artículo')}</nav>
<article><h1>${esc(p.title)}</h1>
<div class="meta"><span>Por ${esc(p.author || 'Equipo V1TR0')}</span><span>${fecha(p.date)}</span><span>${p.minutos} min de lectura</span>${p.updated !== p.date ? `<span>Actualizado: ${fecha(p.updated)}</span>` : ''}</div>
${picture(p.cover, p.title, { cls: 'portada', sizes: '(max-width: 800px) 100vw, 720px', lazy: false })}
${p.resumen ? `<div class="corta"><b>Respuesta corta</b><p>${esc(p.resumen)}</p></div>` : ''}
${marked.parse(p.content)}
${faqs.length ? `<section class="faq"><h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
</article>
<section class="cta"><h2>Prueba V1TR0 POS gratis 7 días</h2><p>Vende, controla tu inventario y conoce tus ganancias desde el celular. Sin tarjeta y sin instalar nada.</p>
<div class="bs"><a class="btn" href="/registro">Crear mi cuenta gratis</a><a class="btn tg" href="${tg(`Hola, leí «${p.title}» en el blog de V1TR0 POS y quiero saber cómo me ayuda en mi negocio.`)}" rel="noopener">Escríbenos por Telegram</a></div>
<p style="margin:14px 0 0;font-size:15px;color:#d1d5db">¿Prefieres correo? <a href="${correo(`Me interesa V1TR0 POS: ${p.title}`, `Hola, leí «${p.title}» y quiero información de V1TR0 POS.`)}">${CORREO}</a></p></section>
${relacionados.length ? `<section class="rel"><h2>Sigue leyendo</h2><div class="lista">${relacionados.map(card).join('')}</div></section>` : ''}
</main>` + foot
}

function paginaIndice(posts) {
  const desc = 'Guías prácticas para tiendas, minimercados, droguerías y negocios en Colombia: ventas, inventario, caja, facturación electrónica y crecimiento.'
  const ld = jsonld({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog de V1TR0 POS', url: `${SITE}/blog/`, description: desc,
    inLanguage: 'es-CO', publisher: ORG, blogPost: posts.slice(0, 30).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: p.url, datePublished: iso(p.date) })) })
  return head({ title: 'Blog de V1TR0 POS: guías para vender más y ordenar tu negocio', desc, url: `${SITE}/blog/`, image: `${SITE}/icon-512.png`, extra: ld }) + `
<main class="wide"><h1>Blog de V1TR0 POS</h1><p style="color:var(--muted);max-width:720px">${desc}</p>
<div class="lista" style="margin-top:26px">${posts.map(card).join('') || '<p>Pronto publicaremos las primeras guías.</p>'}</div></main>` + foot
}

function escribir(rel, contenido) {
  const f = path.join(DIST, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, contenido)
}

const posts = leer()
for (const p of posts) await optimizarPortada(p.cover)
const publicos = posts.filter((p) => p.draft !== true)
for (const p of posts) escribir(`blog/${p.slug}/index.html`, paginaPost(p, publicos.length ? publicos : posts))
escribir('blog/index.html', paginaIndice(publicos))

const hoy = new Date().toISOString().slice(0, 10)
escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${hoy}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
<url><loc>${SITE}/blog/</loc><lastmod>${publicos[0]?.date || hoy}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
${publicos.map((p) => `<url><loc>${p.url}</loc><lastmod>${p.updated}</lastmod><priority>0.7</priority></url>`).join('\n')}
</urlset>\n`)
escribir('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api-proxy/\nDisallow: /login\nDisallow: /registro\n\nSitemap: ${SITE}/sitemap.xml\n`)
escribir('blog/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Blog de V1TR0 POS</title><link>${SITE}/blog/</link><description>Guías para negocios en Colombia</description><language>es-co</language>
${publicos.slice(0, 50).map((p) => `<item><title>${esc(p.title)}</title><link>${p.url}</link><guid>${p.url}</guid><pubDate>${new Date(iso(p.date)).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('\n')}
</channel></rss>\n`)
escribir('llms.txt', `# V1TR0 POS

> Punto de venta (POS) en la nube para pequeños negocios en Colombia. Funciona desde el celular, la tableta o el computador, también sin internet. Lo desarrolla V1TR0 (https://v1tr0.com).

## Datos clave
- Sitio: ${SITE}
- Para quién: tiendas de barrio, minimercados, droguerías, papelerías, ferreterías, panaderías, tiendas de mascotas y negocios que venden al detal y por mayor.
- Funciones: ventas al detal y por mayor, inventario con fotos y escáner con la cámara, alertas de bajo stock, caja con apertura y cierre, recibos impresos (58 mm), por correo o como imagen, catálogo en línea con pedidos, compras, proveedores y cuentas por pagar, panel de ventas y ganancias, usuarios cajeros, funciona sin internet.
- Precios: plan Estándar $39.900 COP al mes o $400.000 al año. Plan Premium $54.900 COP al mes o $570.000 al año, con facturación electrónica DIAN (100 facturas al año; 8 por mes en el plan mensual). Prueba gratis 7 días sin tarjeta.
- Contacto: Telegram @V1tr0 (${TELEGRAM}) · correo ${CORREO}

## Guías del blog
${publicos.map((p) => `- [${p.title}](${p.url}): ${p.resumen || p.description}`).join('\n')}
`)
console.log(`Blog: ${publicos.length} artículos publicados${DRAFTS ? `, ${posts.length - publicos.length} borradores en vista previa` : ''} -> dist/blog`)
