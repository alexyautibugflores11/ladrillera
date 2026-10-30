// Arranque de la app y navegación por la parte # de la dirección.
// Cada pantalla vive en js/screens/<nombre>.js y exporta `async function mostrar(el, params)`.

import { abrir, sembrarSiVacio } from './db.js';
import { aDate, hoy } from './fechas.js';
import { icono } from './iconos.js';
import { cerrarHojas, h } from './ui.js';

// ruta -> título de la barra de arriba, botón que se resalta abajo (null = ninguno)
// y cuántos datos extra lleva la dirección (por ejemplo #/peon/<id> lleva uno).
const RUTAS = {
  resumen: { titulo: 'Resumen', boton: 'resumen', extras: [0, 0] },
  peones: { titulo: 'Peones', boton: 'peones', extras: [0, 0] },
  peon: { titulo: 'Peón', boton: 'peones', extras: [1, 1] },
  pagar: { titulo: 'Pagar semana', boton: 'peones', extras: [1, 1] },
  venta: { titulo: 'Venta', boton: 'venta', extras: [0, 1] },
  gasto: { titulo: 'Gasto', boton: 'gasto', extras: [0, 1] },
  ajustes: { titulo: 'Ajustes', boton: 'ajustes', extras: [0, 0] },
};
const RUTA_INICIAL = '#/resumen';

// Convierte '#/peon/abc' en {nombre: 'peon', params: ['abc'], ...}. Devuelve null si la dirección no existe.
function leerRuta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter((parte) => parte !== '');
  const nombre = partes.shift();
  const ruta = RUTAS[nombre];
  if (!ruta) return null;
  const [minimo, maximo] = ruta.extras;
  if (partes.length < minimo || partes.length > maximo) return null;
  try {
    return { nombre, ...ruta, params: partes.map(decodeURIComponent) };
  } catch (malCodificado) {
    return null;
  }
}

function resaltarBoton(boton) {
  for (const enlace of document.querySelectorAll('[data-ruta]')) {
    const activo = enlace.dataset.ruta === boton;
    enlace.classList.toggle('activo', activo);
    if (activo) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
}

// Fecha larga del encabezado: "sábado 31 de octubre" (solo para mostrar; las cuentas usan hoy() tal cual).
const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });

// El día que se mostró la última vez: sirve para notar que la app siguió abierta en segundo plano pasada la medianoche.
let fechaPintada = null;

function pintarFecha() {
  fechaPintada = hoy();
  document.getElementById('fecha-hoy').textContent = FORMATO_FECHA_LARGA.format(aDate(fechaPintada)).replace(',', '');
}

// Pone los íconos SVG de la barra inferior y del botón de ajustes (index.html marca dónde con data-icono).
function pintarIconos() {
  for (const lugar of document.querySelectorAll('[data-icono]')) {
    lugar.replaceChildren(icono(lugar.dataset.icono, { tam: 26 }));
  }
}

async function navegar() {
  cerrarHojas(); // "Atrás" no debe dejar una hoja abierta (ni la pantalla trabada) encima de otra pantalla
  const ruta = leerRuta();
  if (!ruta) {
    location.replace(RUTA_INICIAL); // cambia la dirección y vuelve a entrar por 'hashchange'
    return;
  }
  document.getElementById('titulo').textContent = ruta.titulo;
  document.title = `${ruta.titulo} · Ladrillera Control`;
  pintarFecha();
  resaltarBoton(ruta.boton);

  // Cada visita dibuja en su propio elemento: si el dueño cambia de pantalla antes de que la anterior termine,
  // lo que ésta termine de dibujar queda en un elemento que ya no se muestra.
  const el = h('section', { class: 'pantalla entrada' }); // 'entrada': fundido corto al cambiar de sección
  document.getElementById('pantalla').replaceChildren(el);
  window.scrollTo(0, 0);
  try {
    const modulo = await import(`./screens/${ruta.nombre}.js`);
    await modulo.mostrar(el, ruta.params);
  } catch (error) {
    console.error(error);
    el.replaceChildren(h('p', { class: 'error-grande' }, 'No se pudo mostrar esta pantalla. Cierra la app y vuelve a abrirla.'));
  }
}

// Si la app vuelve a verse y ya es otro día (se dejó abierta de un día para otro), se dibuja de nuevo:
// así cambian la fecha de arriba, las fechas que propone cada formulario y "Esta semana".
function revisarSiCambioElDia() {
  if (hoy() !== fechaPintada) navegar().catch((error) => console.error(error));
}

// --- Funcionar sin internet y actualizarse sola ---

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // En el computador de desarrollo el service worker pide primero a la red, para ver los cambios al recargar.
  const desarrollo = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  // Cuando sale una versión nueva, el service worker nuevo toma el control y la página se recarga una sola vez.
  // En la primera instalación no hay nada viejo que reemplazar, así que no se recarga.
  const teniaControl = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControl || recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register(desarrollo ? 'sw.js?dev=1' : 'sw.js').catch((error) => {
    console.error('No se pudo instalar el service worker', error);
  });
}

async function iniciar() {
  pintarIconos();
  pintarFecha();
  let baseLista = false;
  try {
    await abrir();
    await sembrarSiVacio(); // debe ir antes de que cualquier pantalla lea la base
    baseLista = true;
  } catch (error) {
    console.error(error);
    document
      .getElementById('pantalla')
      .replaceChildren(h('p', { class: 'error-grande' }, 'No se pudo abrir la base de datos de este teléfono. Cierra la app y vuelve a abrirla.'));
  }

  // Pide que Android no borre los datos si falta espacio; si el navegador dice que no, la app sigue igual.
  Promise.resolve(navigator.storage?.persist?.()).catch(() => {});
  registrarServiceWorker();

  if (baseLista) {
    window.addEventListener('hashchange', navegar);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && revisarSiCambioElDia());
    window.addEventListener('pageshow', revisarSiCambioElDia);
    await navegar();
  }
}

iniciar();
