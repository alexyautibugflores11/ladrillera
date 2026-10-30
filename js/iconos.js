// Íconos SVG propios de la app: trazo de 2 px, sin relleno, del color del texto que los rodea (currentColor).
// Todos se dibujan en una cuadrícula de 24 × 24 y se leen bien entre 24 y 32 px.
// Este módulo solo dibuja íconos: no toca la pantalla hasta que alguien agrega el <svg> que devuelve.

const SVG = 'http://www.w3.org/2000/svg';

// Cada ícono es una lista de figuras: un texto es el `d` de un <path>; un arreglo es [etiqueta, atributos].
const circulo = (cx, cy, r) => ['circle', { cx, cy, r }];
const rectangulo = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];

const DIBUJOS = {
  // --- Secciones ---
  resumen: ['M3 21h18', rectangulo(4, 11, 4, 7, 1), rectangulo(10, 5, 4, 13, 1), rectangulo(16, 8, 4, 10, 1)],
  // peón con casco
  peones: ['M7 9a5 5 0 0 1 10 0', 'M5.5 9h13', 'M8 9v1a4 4 0 0 0 8 0V9', 'M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1'],
  // billete
  venta: [rectangulo(2, 6, 20, 12, 2), circulo(12, 12, 2.5), 'M6 12h.01', 'M18 12h.01'],
  // recibo
  gasto: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3z', 'M9 8h6', 'M9 12h6', 'M9 15.5h3'],
  // engranaje
  ajustes: [
    'M10.34 4.79L10.61 2.1L13.39 2.1L13.66 4.79A7.4 7.4 0 0 1 15.92 5.72L18.02 4.01L19.99 5.98L18.28 8.08' +
      'A7.4 7.4 0 0 1 19.21 10.34L21.9 10.61L21.9 13.39L19.21 13.66A7.4 7.4 0 0 1 18.28 15.92L19.99 18.02' +
      'L18.02 19.99L15.92 18.28A7.4 7.4 0 0 1 13.66 19.21L13.39 21.9L10.61 21.9L10.34 19.21A7.4 7.4 0 0 1 8.08 18.28' +
      'L5.98 19.99L4.01 18.02L5.72 15.92A7.4 7.4 0 0 1 4.79 13.66L2.1 13.39L2.1 10.61L4.79 10.34' +
      'A7.4 7.4 0 0 1 5.72 8.08L4.01 5.98L5.98 4.01L8.08 5.72A7.4 7.4 0 0 1 10.34 4.79Z',
    circulo(12, 12, 3),
  ],

  // --- Acciones ---
  atras: ['M15 18l-6-6 6-6'],
  cerrar: ['M6 6l12 12', 'M18 6L6 18'],
  mas: ['M12 5v14', 'M5 12h14'],
  menos: ['M5 12h14'],
  check: ['M4.5 12.5l5 5L19.5 7'],
  editar: ['M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  borrar: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13', 'M10 11v6', 'M14 11v6'],
  compartir: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5'],
  restaurar: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],

  // --- Datos y estados ---
  calendario: [rectangulo(3, 5, 18, 16, 2), 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  reloj: [circulo(12, 12, 9), 'M12 7v5l3 2'],
  alerta: ['M10.3 4.2L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  casa: ['M3 11l9-7 9 7', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
  fabrica: ['M2 21h20', 'M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17', 'M6.5 17.5h2', 'M11.5 17.5h2'],
  // muro de ladrillos trabados
  ladrillo: [rectangulo(2, 4, 20, 16, 2), 'M2 9.33h20', 'M2 14.67h20', 'M12 4v5.33', 'M7 9.33v5.34', 'M17 9.33v5.34', 'M12 14.67V20'],
  usuario: [circulo(12, 8, 4), 'M4 21a8 8 0 0 1 16 0'],
  etiqueta: ['M2.5 11.6V4A1.5 1.5 0 0 1 4 2.5h7.6l9.9 9.9a1.5 1.5 0 0 1 0 2.1l-7.5 7.5a1.5 1.5 0 0 1-2.1 0z', circulo(7.5, 7.5, 1.5)],
  'flecha-entra': ['M17 7L7 17', 'M17 17H7V7'],
  'flecha-sale': ['M7 17L17 7', 'M7 7h10v10'],

  // --- Tipos de gasto ---
  // serrucho y aserrín que cae
  aserrin: [
    'M15 6L3 10v3l1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5z',
    'M15 5h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4z',
    'M18 8.5v3',
    'M5 19.5h.01',
    'M9 21h.01',
    'M13 19.5h.01',
  ],
  // llama sobre dos troncos cruzados
  lena: ['M12 3c1 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-4.5 1-7.5z', 'M4 21l16-3', 'M4 18l16 3'],
  // montón de arena con granos
  arena: ['M2 20h20', 'M4 20c2-6 5-9 8-9s6 3 8 9', 'M9 16h.01', 'M12 14h.01', 'M15 16h.01', 'M12 18h.01'],
  // suelo con capas y un brote
  tierra: ['M2 11h20', 'M2 16c3-2 5 2 8 0s5-2 8 0 3 1 4 0', 'M6 20h.01', 'M12 20.5h.01', 'M18 20h.01', 'M12 11V6', 'M12 7c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4z'],
  // rayo
  luz: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  // tenedor y cuchillo
  comida: ['M7 3v18', 'M4 3v5a3 3 0 0 0 6 0V3', 'M17 21V3c-2 1-3.5 4-3.5 8H17'],
  // gota
  agua: ['M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'],
};

const TIPOS_GASTO = new Set(['aserrin', 'lena', 'arena', 'tierra', 'luz', 'comida', 'agua']);

// icono('venta') → <svg> listo para agregar. Un nombre desconocido dibuja el ícono "etiqueta".
export function icono(nombre, { tam = 24, clase } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  const atributos = {
    viewBox: '0 0 24 24',
    width: tam,
    height: tam,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [clave, valor] of Object.entries(atributos)) svg.setAttribute(clave, String(valor));
  if (clase) svg.setAttribute('class', clase);

  for (const figura of DIBUJOS[nombre] ?? DIBUJOS.etiqueta) {
    const [etiqueta, props] = typeof figura === 'string' ? ['path', { d: figura }] : figura;
    const el = document.createElementNS(SVG, etiqueta);
    for (const [clave, valor] of Object.entries(props)) {
      if (valor !== undefined) el.setAttribute(clave, String(valor));
    }
    svg.append(el);
  }
  return svg;
}

// Nombre del ícono para un tipo de gasto: "Leña" → 'lena', "Aserrín" → 'aserrin'.
// Los tipos que crea el dueño (y cualquier nombre desconocido) usan 'etiqueta'.
export function iconoTipoGasto(nombreTipo) {
  const clave = String(nombreTipo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return TIPOS_GASTO.has(clave) ? clave : 'etiqueta';
}
