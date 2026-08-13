/* ==========================================================================
   Service worker — deixa o app funcionar offline e se atualizar sozinho.

   Estratégia:
   · o HTML usa network-first, então uma nova publicação é notada na hora;
   · os demais arquivos usam cache-first com revalidação em segundo plano;
   · uma versão nova só assume o controle quando o usuário confirma
     (mensagem SKIP_WAITING enviada pela faixa "Nova versão disponível").
   ========================================================================== */

// Substituído no build pelo hash do conteúdo. Precisa mudar a cada
// publicação: o navegador só reinstala o service worker quando este
// arquivo muda byte a byte — com uma constante fixa, nenhuma versão nova
// era detectada e a faixa "Nova versão disponível" nunca aparecia.
const VERSION = "1632b7259b04";
const CACHE = `gasto-esperto-${VERSION}`;
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}) // uma URL indisponível não pode travar a instalação
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = request.mode === "navigate" || request.destination === "document";

  if (isDocument) {
    // network-first: garante que a versão publicada chegue rápido
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", response.clone());
        return response;
      } catch {
        const cached = await caches.match("./index.html") || await caches.match("./");
        return cached || new Response(
          "<h1>Sem conexão</h1><p>Abra o app novamente quando tiver internet.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
        );
      }
    })());
    return;
  }

  // demais recursos: responde do cache e atualiza por trás
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});
