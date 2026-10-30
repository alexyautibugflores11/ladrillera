// Ayudas de pantalla compartidas por todas las pantallas: crear elementos, hojas que suben desde abajo,
// confirmaciones, avisos, campos de formulario y navegación.
// Importar este módulo no toca el DOM: todo ocurre cuando se llama a cada función.

import { icono } from './iconos.js';

// --- Crear elementos ---

// Propiedades que se asignan directo al elemento (no como atributo), para que sigan el estado vivo.
const PROPIEDADES = new Set(['value', 'checked', 'disabled', 'selected']);

function agregar(padre, hijo) {
  if (hijo === null || hijo === undefined || hijo === false || hijo === true) return;
  if (Array.isArray(hijo)) {
    for (const parte of hijo) agregar(padre, parte);
  } else {
    padre.append(hijo); // un Node entra tal cual; un texto o número se vuelve nodo de texto (sin interpretar HTML)
  }
}

// h('button', {class: 'boton', onclick: () => ...}, 'Guardar')
// `props` es opcional: si el segundo argumento es un texto o un elemento, se toma como primer hijo.
export function h(tag, props, ...hijos) {
  const esProps = props !== null && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
  if (!esProps) {
    if (props !== null && props !== undefined) hijos.unshift(props);
    props = {};
  }
  const el = document.createElement(tag);
  for (const [nombre, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined) continue;
    if (nombre === 'class') {
      el.className = valor;
    } else if (nombre.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(nombre.slice(2).toLowerCase(), valor);
    } else if (PROPIEDADES.has(nombre)) {
      el[nombre] = valor;
    } else if (valor === true) {
      el.setAttribute(nombre, '');
    } else if (valor !== false) {
      el.setAttribute(nombre, valor);
    }
  }
  agregar(el, hijos);
  return el;
}

// --- Hojas (suben desde abajo) ---

// Las hojas que están abiertas, cada una con su cerrar(). Sirve para el candado del fondo y para cerrarHojas().
const hojasAbiertas = new Set();

// Crea la hoja. `alCerrar` se llama una sola vez, sea cual sea la forma de cerrarla (botón, fondo, Escape o cerrar()).
function crearHoja(titulo, contenido, alCerrar) {
  const anterior = document.activeElement;
  let cerrada = false;

  const hoja = h(
    'div',
    { class: 'hoja', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo, tabindex: '-1' },
    h(
      'div',
      { class: 'hoja-cabecera' },
      h('h2', {}, titulo),
      h('button', { class: 'boton-cerrar', type: 'button', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))
    ),
    h('div', { class: 'hoja-cuerpo' }, contenido)
  );
  const fondo = h('div', { class: 'fondo-hoja', onclick: (evento) => evento.target === fondo && cerrar() }, hoja);

  function alTeclear(evento) {
    if (evento.key === 'Escape') cerrar();
  }

  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    document.removeEventListener('keydown', alTeclear);
    fondo.classList.remove('abierta');
    setTimeout(() => fondo.remove(), 200); // deja terminar la animación de bajada
    hojasAbiertas.delete(cerrar);
    if (hojasAbiertas.size === 0) document.body.classList.remove('con-hoja');
    if (anterior && anterior.focus) anterior.focus();
    if (alCerrar) alCerrar();
  }

  document.addEventListener('keydown', alTeclear);
  document.body.classList.add('con-hoja');
  hojasAbiertas.add(cerrar);
  document.body.append(fondo);
  fondo.getBoundingClientRect(); // fuerza el primer dibujo para que la subida se anime
  fondo.classList.add('abierta');
  hoja.focus();
  return { cerrar };
}

// Cierra todas las hojas abiertas, cada una por su camino normal: una pregunta de confirmar() entrega false
// y se suelta el candado del fondo. La usa la navegación, para que "Atrás" no deje una hoja sobre otra pantalla.
export function cerrarHojas() {
  for (const cerrar of [...hojasAbiertas]) cerrar();
}

// Muestra `contenido` (elemento, texto o lista de ambos) en una hoja con título. Devuelve {cerrar()}.
export function abrirHoja(titulo, contenido) {
  return crearHoja(titulo, contenido);
}

// Pregunta Sí/No en su propia hoja. Entrega true solo si toca el botón de "sí"; cualquier otra forma de cerrar es false.
export function confirmar(mensaje, { si = 'Sí', no = 'Cancelar' } = {}) {
  return new Promise((resolver) => {
    let hoja = null;
    const responder = (respuesta) => {
      resolver(respuesta);
      if (hoja) hoja.cerrar();
    };
    hoja = crearHoja(
      'Confirmar',
      [
        h('p', { class: 'mensaje-confirmar' }, mensaje),
        h(
          'div',
          { class: 'fila-botones' },
          h('button', { class: 'boton secundario', type: 'button', onclick: () => responder(false) }, no),
          h('button', { class: 'boton', type: 'button', onclick: () => responder(true) }, si)
        ),
      ],
      () => resolver(false) // si ya se respondió, esto no cambia nada
    );
  });
}

// --- Aviso breve ---

const MILISEGUNDOS_AVISO = 2500;
let avisoActual = null;
let relojAviso = null;

// Los avisos de falla ("No se pudo guardar...") llevan el ícono de alerta en vez del ✓; el texto no cambia.
const ES_FALLA = /^No se pudo/;

export function aviso(mensaje) {
  clearTimeout(relojAviso);
  if (avisoActual) avisoActual.remove();
  const falla = ES_FALLA.test(String(mensaje));
  avisoActual = h(
    'div',
    { class: falla ? 'aviso falla' : 'aviso', role: 'status' },
    h('span', { class: 'aviso-icono' }, icono(falla ? 'alerta' : 'check')),
    h('span', { class: 'aviso-texto' }, mensaje)
  );
  document.body.append(avisoActual);
  const este = avisoActual;
  relojAviso = setTimeout(() => {
    este.remove();
    if (avisoActual === este) avisoActual = null;
  }, MILISEGUNDOS_AVISO);
}

// --- Campos de formulario ---

let contadorCampos = 0;

const MODOS_TECLADO = { monto: 'decimal', cantidad: 'numeric' };

// Etiqueta + caja de texto + ayuda + mensaje de error. `error('')` borra el mensaje.
// monto y cantidad abren el teclado numérico; el texto escrito se lee después con parseMonto / parseCantidad.
export function campo({ etiqueta, tipo = 'texto', valor, ayuda }) {
  contadorCampos += 1;
  const id = `campo-${contadorCampos}`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;

  const input = h('input', {
    id,
    class: 'caja',
    type: tipo === 'fecha' ? 'date' : 'text',
    inputmode: MODOS_TECLADO[tipo],
    autocomplete: 'off',
    'aria-describedby': ayuda ? `${idAyuda} ${idError}` : idError,
  });
  if (valor !== null && valor !== undefined) input.value = String(valor);

  const mensajeError = h('p', { class: 'error', id: idError, role: 'alert', hidden: true });
  const el = h(
    'div',
    { class: 'campo' },
    h('label', { for: id }, etiqueta),
    input,
    ayuda ? h('p', { class: 'ayuda', id: idAyuda }, ayuda) : null,
    mensajeError
  );

  function error(mensaje) {
    const texto = mensaje || '';
    mensajeError.textContent = texto;
    mensajeError.hidden = texto === '';
    el.classList.toggle('con-error', texto !== '');
    input.setAttribute('aria-invalid', texto === '' ? 'false' : 'true');
  }

  return { el, input, error };
}

// Bajo la caja de un campo de monto o precio muestra, mientras se escribe, cómo lee la app lo escrito ("= $1.500,00").
// `leer` convierte el texto en valor (null si no se entiende) y `formato` lo escribe; si no se entiende no muestra nada.
// Devuelve una función que lo vuelve a calcular: hay que llamarla después de cambiar `input.value` desde el código.
export function agregarEco(c, leer, formato) {
  const eco = h('p', { class: 'eco', id: `${c.input.id}-eco`, 'aria-live': 'polite' });
  c.input.after(eco);
  c.input.setAttribute('aria-describedby', `${eco.id} ${c.input.getAttribute('aria-describedby') ?? ''}`.trim());
  const actualizar = () => {
    const valor = leer(c.input.value);
    eco.textContent = valor === null ? '' : `= ${formato(valor)}`;
  };
  c.input.addEventListener('input', actualizar);
  actualizar();
  return actualizar;
}

// --- Nombres ---

// Para comparar nombres sin fijarse en mayúsculas, tildes ni espacios de más: "Leña", "LENA" y " lena  " son el mismo.
export function claveNombre(texto) {
  return String(texto).trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- Estado vacío ---

// Dibujo de tres ladrillos apilados para los estados vacíos (decorativo: aria-hidden).
function ilustracionLadrillos() {
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 96 64');
  svg.setAttribute('width', '96');
  svg.setAttribute('height', '64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'vacio-dibujo');
  const piezas = [
    [4, 36, 'ladrillo-a'],
    [50, 36, 'ladrillo-b'],
    [27, 8, 'ladrillo-a'],
  ];
  for (const [x, y, clase] of piezas) {
    const pieza = document.createElementNS(SVG, 'rect');
    for (const [clave, valor] of Object.entries({ x, y, width: 42, height: 22, rx: 4, class: clase })) pieza.setAttribute(clave, String(valor));
    svg.append(pieza);
  }
  return svg;
}

// Bloque para cuando no hay nada que mostrar: dibujo de ladrillos, título, una línea y, si se pasa, una acción
// (`accion` es un elemento ya hecho, por ejemplo un botón creado con h()).
export function estadoVacio({ titulo, texto, accion } = {}) {
  return h(
    'div',
    { class: 'vacio' },
    ilustracionLadrillos(),
    titulo ? h('p', { class: 'vacio-titulo' }, titulo) : null,
    texto ? h('p', { class: 'vacio-texto' }, texto) : null,
    accion ?? null
  );
}

// --- Navegación ---

// ir('/venta') y ir('#/venta') llevan a la misma pantalla.
export function ir(ruta) {
  location.hash = ruta.startsWith('#') ? ruta : `#${ruta}`;
}
