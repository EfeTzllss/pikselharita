// Piksel Harita — Cloudflare Pages worker (advanced mode).
// Serves the static site, plus:
//   /api/devlog  -> the @piksel.harita Instagram photo/carousel posts (no videos, no reels), cached 10 min
//   /api/ig-img  -> a small image proxy for Instagram's CDN, so post images load on our own domain
// Settings in the Cloudflare Pages project (Settings -> Variables and Secrets / Bindings):
//   IG_TOKEN (secret)  long-lived Instagram User access token (Instagram API with Instagram Login)
//   IG_KV    (KV, optional but recommended)  lets the worker refresh the token itself before its 60 days run out

const IG = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
const CACHE_SECONDS = 600;
const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000;
const IMG_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/devlog') return await devlog(request, env, ctx);
      if (url.pathname === '/api/ig-img') return await image(url, ctx);
    } catch (err) {
      return json({ posts: [], error: String(err && err.message || err) }, 502, 'no-store');
    }
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200, cache = `public, max-age=${CACHE_SECONDS}`) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
}
const edgeCache = () => (typeof caches !== 'undefined' && caches.default) || null;

async function token(env, ctx) {
  const seed = env.IG_TOKEN;
  if (!seed) throw new Error('IG_TOKEN ayarlanmamış');
  if (!env.IG_KV) return seed;
  let saved = null;
  try { saved = JSON.parse(await env.IG_KV.get('ig_token') || 'null'); } catch (e) { saved = null; }
  // a new IG_TOKEN pasted into the settings always wins over the stored one
  if (!saved || saved.seed !== seed.slice(-16)) saved = { t: seed, at: 0, seed: seed.slice(-16) };
  if (Date.now() - saved.at > REFRESH_AFTER_MS) {
    const work = (async () => {
      const r = await fetch(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(saved.t)}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.access_token) await env.IG_KV.put('ig_token', JSON.stringify({ t: d.access_token, at: Date.now(), seed: saved.seed }));
    })().catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  }
  return saved.t;
}

function pickImage(m) {
  if (m.media_type === 'IMAGE') return { src: m.media_url, count: 1 };
  if (m.media_type === 'CAROUSEL_ALBUM') {
    const kids = (m.children && m.children.data) || [];
    const first = kids.find(k => k.media_type === 'IMAGE') || kids[0];
    const src = first ? (first.media_type === 'IMAGE' ? first.media_url : first.thumbnail_url) : m.media_url;
    return { src, count: kids.length || 1 };
  }
  return null;
}

async function devlog(request, env, ctx) {
  const cache = edgeCache(), key = new Request(new URL('/api/devlog', request.url).toString());
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const t = await token(env, ctx);
  const r = await fetch(`${IG}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=50&access_token=${encodeURIComponent(t)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error('Instagram: ' + ((d.error && d.error.message) || r.status));
  const posts = [];
  for (const m of d.data || []) {
    if (m.media_type === 'VIDEO' || m.media_product_type === 'REELS' || m.media_product_type === 'STORY') continue; // photos and carousels only
    const im = pickImage(m);
    if (!im || !im.src) continue;
    posts.push({ id: m.id, caption: m.caption || '', permalink: m.permalink, timestamp: m.timestamp,
      image: '/api/ig-img?u=' + encodeURIComponent(im.src), count: im.count });
  }
  const res = json({ posts });
  if (cache) { const put = cache.put(key, res.clone()); if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put; }
  return res;
}

async function image(url, ctx) {
  const u = url.searchParams.get('u');
  let target;
  try { target = new URL(u); } catch (e) { return new Response('bad url', { status: 400 }); }
  if (target.protocol !== 'https:' || !IMG_HOSTS.test(target.hostname)) return new Response('forbidden', { status: 403 });
  const r = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return new Response('not found', { status: 404 });
  const type = r.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return new Response('not an image', { status: 415 });
  return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } });
}
