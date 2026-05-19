self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Interceptar solo peticiones del mismo origen que NO empiecen con /api/
  // Excluir assets estáticos del portal (Vite build output, favicon, etc.) — nunca deben ir al proxy
  const PORTAL_STATIC = ['/assets/', '/favicon.ico', '/logo1.png', '/public/'];
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !PORTAL_STATIC.some(p => url.pathname.startsWith(p) || url.pathname === p)) {
    // Si la petición viene referenciada desde el flujo del proxy (EWS)
    const referer = event.request.referrer;
    if (referer && referer.includes('/ews-proxy/')) {
      // Extraer el id del dispositivo del referer
      const match = referer.match(/\/api\/v1\/devices\/([^/]+)\/ews-proxy/);
      if (match) {
        const deviceId = match[1];
        // Re-enrutar la petición de forma transparente al proxy de la API
        const newUrl = `${self.location.origin}/api/v1/devices/${deviceId}/ews-proxy${url.pathname}${url.search}`;
        
        // Crear las opciones para el nuevo fetch a partir de la petición original
        const fetchOptions = {
          method: event.request.method,
          headers: new Headers(event.request.headers),
          credentials: event.request.credentials || 'include'
        };

        // Solo incluir el body si no es una petición GET o HEAD
        if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
          fetchOptions.body = event.request.clone().body;
        }

        event.respondWith(
          fetch(newUrl, fetchOptions)
        );
      }
    }
  }
});
