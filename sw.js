// Service worker: guarda todos los archivos de la app en el teléfono para que funcione sin internet.
//
// Cuando se cambia cualquier archivo de la app, hay que subir el número de VERSION (ladrillera-v3, v4...):
// así el teléfono baja la versión nueva, borra la vieja y recarga la app una vez.
// Cuando se agrega un archivo a la app, hay que agregarlo también a ARCHIVOS (si falta uno que no existe, la instalación falla).

const VERSION = 'ladrillera-v3';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/backup.js',
  './js/calc.js',
  './js/db.js',
  './js/fechas.js',
  './js/hojas.js',
  './js/iconos.js',
  './js/money.js',
  './js/ui.js',
  './js/screens/ajustes.js',
  './js/screens/gasto.js',
  './js/screens/pagar.js',
  './js/screens/peon.js',
  './js/screens/peones.js',
  './js/screens/resumen.js',
  './js/screens/venta.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// En el computador (localhost) la app se registra con sw.js?dev=1: pide primero a la red, para ver los cambios al recargar.
const MODO_DESARROLLO = new URL(self.location).searchParams.get('dev') === '1';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      // cache: 'reload' salta el caché del navegador, para no guardar una copia vieja de un archivo
      .then((cache) => cache.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      // Solo se borran las versiones viejas de esta app (ladrillera-...), nunca los caches de otras cosas del mismo sitio.
      .then((nombres) => Promise.all(nombres.filter((nombre) => nombre.startsWith('ladrillera-') && nombre !== VERSION).map((nombre) => caches.delete(nombre))))
      .then(() => self.clients.claim())
  );
});

// Normal: primero lo guardado en el teléfono y, si no está, la red.
async function primeroElCache(pedido) {
  const guardado = await caches.match(pedido, { ignoreSearch: true });
  if (guardado) return guardado;
  try {
    return await fetch(pedido);
  } catch (sinRed) {
    // Sin internet y sin esa dirección guardada: si era abrir una página, se abre la app.
    if (pedido.mode === 'navigate') {
      const inicio = await caches.match('./index.html');
      if (inicio) return inicio;
    }
    throw sinRed;
  }
}

// Desarrollo: primero la red (y se actualiza lo guardado); solo si la red falla, lo guardado.
async function primeroLaRed(pedido) {
  try {
    const respuesta = await fetch(pedido, { cache: 'no-cache' });
    if (respuesta.ok) {
      const cache = await caches.open(VERSION);
      await cache.put(pedido, respuesta.clone());
    }
    return respuesta;
  } catch (sinRed) {
    const guardado = await caches.match(pedido, { ignoreSearch: true });
    if (guardado) return guardado;
    throw sinRed;
  }
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  if (new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith(MODO_DESARROLLO ? primeroLaRed(pedido) : primeroElCache(pedido));
});
