// render.js — customer-facing HTML: product page, hidden (410), not found (404) and the shop home.
// Mobile-first (360px), breakpoints 640px / 1024px; Noto Sans Thai; primary colour from shop settings.

const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICON = {
  chat: '<path d="M12 4C7 4 3 7.1 3 11c0 2.4 1.5 4.5 3.8 5.8L6 20l3.6-2.2c.8.1 1.6.2 2.4.2 5 0 9-3.1 9-7s-4-7-9-7z"></path>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M21 16l-5-5-9 9"></path>',
  eyeOff: '<path d="M3 3l18 18"></path><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.2"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
};
const icon = (name, size) =>
  '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';

/** Primary colour, readable text colour on it, and a darker accent for text on light tints. */
function theme(color) {
  const hex = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2563EB';
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6;
  const accent = light ? '#' + rgb.map((c) => Math.round(c * 0.45).toString(16).padStart(2, '0')).join('') : hex;
  return { primary: hex, onPrimary: light ? '#1C1917' : '#FFFFFF', accent, tint: hex + '1F' };
}

/** https://line.me/R/oaMessage/{percent-encoded LINE ID}/?{percent-encoded text} (LINE URL scheme docs). */
export function lineUrl(lineOaId, text) {
  if (!lineOaId) return '';
  return 'https://line.me/R/oaMessage/' + encodeURIComponent(lineOaId) + '/?' + encodeURIComponent(text || '');
}

/**
 * The LINE button. Before the shop sets its LINE OA ID it is shown as a demo: same look, but a tap
 * explains what it will do instead of opening LINE (so the page can be shown to the shop owner early).
 */
function lineButton(shop, text, cls, label, iconSize) {
  const url = lineUrl(shop.lineOaId, text);
  const inner = icon('chat', iconSize) + esc(label);
  if (url) return '<a class="' + cls + '" href="' + esc(url) + '" rel="noopener">' + inner + '</a>';
  const note = 'ตัวอย่างปุ่ม — เมื่อร้านตั้งค่า LINE OA แล้ว ปุ่มนี้จะเปิดแชท LINE ของร้าน' + (text ? ' พร้อมข้อความ “' + text + '”' : '');
  return '<button type="button" class="' + cls + '" data-line-demo="' + esc(note) + '">' + inner + '</button>';
}

// Shows the demo note under a LINE button that has no LINE OA ID yet.
const LINE_DEMO_JS = `document.addEventListener('click',function(e){var b=e.target.closest('[data-line-demo]');if(!b)return;var n=document.getElementById('line-demo');if(!n){n=document.createElement('p');n.id='line-demo';n.setAttribute('role','status');n.className='demo-note';b.insertAdjacentElement('afterend',n)}n.textContent=b.getAttribute('data-line-demo')});`;

const CSS = `
:root{--primary:#2563EB;--on-primary:#fff;--accent:#2563EB;--tint:#2563EB1F;--text:#18181B;--text-2:#3F3F46;--muted:#63636B;--border:#ECECEE;--photo:#F5F5F7}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:'Noto Sans Thai',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--text);background:#fff;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
.top{height:56px;padding:0 16px;border-bottom:1px solid var(--border);display:flex;align-items:center}
.top-inner{width:100%;max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:10px;text-decoration:none}
.logo{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);object-fit:cover;background:#fff;flex-shrink:0}
.logo.initials{display:flex;align-items:center;justify-content:center;background:var(--primary);color:var(--on-primary);border:0;font-size:12px;font-weight:700}
.shop{font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.product{max-width:1120px;margin:0 auto;padding-bottom:104px}
.gallery{position:relative}
.slides{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;background:var(--photo)}
.slides::-webkit-scrollbar{display:none}
.slide{flex:0 0 100%;aspect-ratio:1;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;color:#9A9AA3}
.slide img{width:100%;height:100%;object-fit:contain;display:block}
.counter{position:absolute;top:12px;right:12px;font-size:12px;font-weight:500;padding:2px 10px;border-radius:999px;background:rgba(24,24,27,.62);color:#fff}
.dots{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;gap:6px;pointer-events:none}
.dots span{width:6px;height:6px;border-radius:999px;background:rgba(24,24,27,.25);transition:width .2s,background .2s}
.dots span.on{width:18px;background:var(--primary)}
.thumbs{display:none}
.info{padding:20px 16px;display:flex;flex-direction:column;gap:8px}
.chip{align-self:flex-start;font-size:12px;font-weight:500;padding:4px 10px;border-radius:999px;background:var(--tint);color:var(--accent)}
h1{margin:0;font-size:22px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.code{font-size:13px;color:var(--muted)}
.rule{height:1px;background:var(--border);margin:8px 0}
.desc{margin:0;font-size:15px;line-height:1.75;color:var(--text-2);white-space:pre-line;overflow-wrap:anywhere}
.cta{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(20px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--border)}
.btn-line{height:52px;border-radius:12px;background:var(--primary);color:var(--on-primary);display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:600;text-decoration:none}
.btn-outline{height:48px;padding:0 24px;border-radius:12px;border:1.5px solid var(--primary);color:var(--accent);display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600;text-decoration:none}
.hint{font-size:13px;color:var(--muted)}
button.btn-line,button.btn-outline{font:inherit;font-weight:600;cursor:pointer;width:100%}button.btn-outline{width:auto;background:transparent}button.btn-line{border:0;font-size:16px}
.demo-note{margin:8px 0 0;padding:8px 12px;border-radius:10px;background:var(--tint);color:var(--accent);font-size:13px;line-height:1.6;text-align:left}
.cta .hint{display:none}
.message{min-height:calc(100vh - 56px);padding:0 32px 80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center}
.message .badge{width:72px;height:72px;border-radius:999px;background:var(--tint);color:var(--accent);display:flex;align-items:center;justify-content:center;margin-bottom:4px}
.message h1{font-size:20px}
.message p{margin:0 0 12px;font-size:14px;line-height:1.7;color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (min-width:640px){.product{padding:24px 16px 104px}.slides{border-radius:16px}}
@media (min-width:1024px){
.top{height:64px}.logo{width:36px;height:36px}.shop{font-size:18px}
.product{padding:40px 0 48px;display:grid;grid-template-columns:560px minmax(0,1fr);gap:56px;align-items:start}
.slides{border-radius:16px}.dots{display:none}
.thumbs{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
.thumbs button{width:80px;height:80px;padding:0;border:2px solid transparent;border-radius:12px;background:var(--photo);overflow:hidden;cursor:pointer}
.thumbs button[aria-current="true"]{border-color:var(--accent)}
.thumbs img{width:100%;height:100%;object-fit:cover;display:block}
.info{padding:8px 0 0;gap:10px}h1{font-size:32px;line-height:1.4}.code{font-size:14px}.rule{margin:12px 0}
.desc{font-size:16px;line-height:1.8;margin-bottom:20px}
.cta{position:static;padding:0;border:0;display:flex;flex-direction:column;gap:10px}.cta .btn-line{width:280px}.cta .hint{display:block}
}`;

// Keeps dots/counter/thumbnails in step with the swipeable gallery. Tiny, no dependencies.
const GALLERY_JS = `(function(){var s=document.querySelector('.slides');if(!s)return;var n=s.children.length;var dots=document.querySelectorAll('.dots span');var thumbs=document.querySelectorAll('.thumbs button');var counter=document.querySelector('.counter');function set(i){dots.forEach(function(d,k){d.className=k===i?'on':''});thumbs.forEach(function(t,k){t.setAttribute('aria-current',k===i?'true':'false')});if(counter)counter.textContent=(i+1)+' / '+n}var t;s.addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){set(Math.round(s.scrollLeft/s.clientWidth))},60)},{passive:true});thumbs.forEach(function(b,k){b.addEventListener('click',function(){s.scrollTo({left:k*s.clientWidth,behavior:'smooth'});set(k)})})})();`;

function header(shop) {
  const logo = shop.logoSrc
    ? '<img class="logo" src="' + esc(shop.logoSrc) + '" alt="" width="32" height="32">'
    : '<span class="logo initials" aria-hidden="true">' + esc((shop.shopName || 'ร้าน').replace(/\s+/g, '').slice(0, 2).toUpperCase()) + '</span>';
  return '<header class="top"><a class="top-inner" href="/">' + logo + '<span class="shop">' + esc(shop.shopName || 'ร้านค้า') + '</span></a></header>';
}

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap';

function layout({ shop, title, description, canonical, image, type, noindex, body, script, preloadImage }) {
  const t = theme(shop.primaryColor);
  return '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<title>' + esc(title) + '</title>' +
    (description ? '<meta name="description" content="' + esc(description) + '">' : '') +
    (noindex ? '<meta name="robots" content="noindex">' : '') +
    (shop.fbAppId ? '<meta property="fb:app_id" content="' + esc(shop.fbAppId) + '">' : '') +
    '<meta property="og:site_name" content="' + esc(shop.shopName || '') + '">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    (description ? '<meta property="og:description" content="' + esc(description) + '">' : '') +
    '<meta property="og:type" content="' + (type || 'website') + '">' +
    (canonical ? '<meta property="og:url" content="' + esc(canonical) + '"><link rel="canonical" href="' + esc(canonical) + '">' : '') +
    (image ? '<meta property="og:image" content="' + esc(image) + '"><meta name="twitter:card" content="summary_large_image">' : '') +
    '<meta name="theme-color" content="' + t.primary + '">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    // Load the web font without blocking first paint (system font shows first, then swaps).
    '<link rel="preload" as="style" href="' + FONT_CSS + '" onload="this.onload=null;this.rel=\'stylesheet\'">' +
    '<noscript><link rel="stylesheet" href="' + FONT_CSS + '"></noscript>' +
    (preloadImage ? '<link rel="preload" as="image" href="' + esc(preloadImage.src) + '" imagesrcset="' + esc(preloadImage.srcset) + '" imagesizes="(min-width:1024px) 560px, 100vw" fetchpriority="high">' : '') +
    '<link rel="icon" href="' + (shop.logoSrc ? esc(shop.logoSrc) : 'data:,') + '">' +
    '<style>' + CSS + ':root{--primary:' + t.primary + ';--on-primary:' + t.onPrimary + ';--accent:' + t.accent + ';--tint:' + t.tint + '}</style>' +
    '</head><body>' + header(shop) + body + (script ? '<script>' + script + '</script>' : '') + '</body></html>';
}

/** og:description: plain text, whitespace collapsed, cut to 150 characters. */
export function shortDescription(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > 150 ? s.slice(0, 149) + '…' : s;
}

/** images: [{ name, src, srcset, thumb }] already signed by the caller. */
export function productPage({ shop, product, images, url, ogImage }) {
  const text = 'สนใจสินค้า ' + product.code + ' ' + product.name;
  const count = images.length;
  const slides = count
    ? images.map((img, i) =>
        '<div class="slide"><img src="' + esc(img.src) + '" srcset="' + esc(img.srcset) + '" sizes="(min-width:1024px) 560px, 100vw" alt="' + esc(product.name + ' รูปที่ ' + (i + 1)) + '"' +
        (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"></div>').join('')
    : '<div class="slide">' + icon('image', 40) + '</div>';
  const gallery = '<div class="gallery"><div class="slides" tabindex="0" aria-label="รูปสินค้า ปัดซ้าย-ขวาเพื่อดูรูปถัดไป">' + slides + '</div>' +
    (count > 1
      ? '<span class="counter" aria-hidden="true">1 / ' + count + '</span><div class="dots" aria-hidden="true">' + images.map((_, i) => '<span' + (i === 0 ? ' class="on"' : '') + '></span>').join('') + '</div>'
      : '') +
    '</div>' +
    (count > 1
      ? '<div class="thumbs">' + images.map((img, i) => '<button type="button" aria-label="ดูรูปที่ ' + (i + 1) + '" aria-current="' + (i === 0) + '"><img src="' + esc(img.thumb) + '" alt="" loading="lazy"></button>').join('') + '</div>'
      : '');
  const body = '<main class="product"><div>' + gallery + '</div>' +
    '<div class="info">' +
    (product.category ? '<span class="chip">' + esc(product.category) + '</span>' : '') +
    '<h1>' + esc(product.name) + '</h1><span class="code">รหัสสินค้า ' + esc(product.code) + '</span>' +
    (product.description ? '<div class="rule"></div><p class="desc">' + esc(product.description) + '</p>' : '') +
    '<div class="cta">' + lineButton(shop, text, 'btn-line', 'ทัก LINE', 22) +
    '<span class="hint">กดแล้วจะเปิดแชท LINE ของร้าน พร้อมข้อความ “' + esc(text) + '”</span></div>' +
    '</div></main>';
  return layout({
    shop,
    title: product.name + (shop.shopName ? ' | ' + shop.shopName : ''),
    description: shortDescription(product.description) || product.name,
    canonical: url,
    image: ogImage,
    type: 'product',
    body,
    script: (count > 1 ? GALLERY_JS : '') + (shop.lineOaId ? '' : LINE_DEMO_JS),
    preloadImage: count ? images[0] : null,
  });
}

function messagePage({ shop, title, text, iconName, url, buttonText }) {
  const body = '<main class="message"><div class="badge">' + icon(iconName, 32) + '</div><h1>' + esc(title) + '</h1><p>' + text + '</p>' +
    '<div>' + lineButton(shop, '', 'btn-outline', buttonText || 'ทัก LINE ร้าน', 20) + '</div></main>';
  return layout({ shop, title: title + (shop.shopName ? ' | ' + shop.shopName : ''), canonical: url, noindex: true, body, script: shop.lineOaId ? '' : LINE_DEMO_JS });
}

export const hiddenPage = (shop, url) =>
  messagePage({ shop, url, iconName: 'eyeOff', title: 'สินค้านี้ไม่พร้อมจำหน่าย', text: 'สินค้าอาจหมดหรือเลิกจำหน่ายแล้ว<br>ทักร้านทาง LINE เพื่อสอบถามสินค้าอื่นได้' });

export const notFoundPage = (shop, url) =>
  messagePage({ shop, url, iconName: 'search', title: 'ไม่พบสินค้านี้', text: 'ลิงก์อาจไม่ถูกต้องหรือสินค้าถูกเปลี่ยนแปลง<br>ทักร้านทาง LINE เพื่อสอบถามได้' });

export const errorPage = (shop, url) =>
  messagePage({ shop, url, iconName: 'search', title: 'ขออภัย ระบบขัดข้องชั่วคราว', text: 'กรุณาลองใหม่อีกครั้งในอีกสักครู่' });

export function homePage(shop, url) {
  const body = '<main class="message"><h1>' + esc(shop.shopName || 'ร้านค้า') + '</h1><p>ดูรายละเอียดสินค้าจากลิงก์ที่ร้านส่งให้<br>หรือทักร้านทาง LINE</p>' +
    '<div>' + lineButton(shop, '', 'btn-outline', 'ทัก LINE ร้าน', 20) + '</div></main>';
  return layout({ shop, title: shop.shopName || 'ร้านค้า', canonical: url, body, image: shop.logoOg, script: shop.lineOaId ? '' : LINE_DEMO_JS });
}
