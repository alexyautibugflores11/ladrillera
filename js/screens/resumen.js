// Resumen: lo que entró, lo que salió y los ladrillos de la semana, el mes o todo el tiempo.
// Los números salen todos de calc.js; aquí solo se elige el período y el filtro, se dibuja y se abren las filas.

import { cargarTodo } from '../db.js';
import { hacerRespaldo } from '../backup.js';
import { movimientos, necesitaRespaldo, resumenLadrillos, totales } from '../calc.js';
import { formatoFecha, hoy, rangoPeriodo } from '../fechas.js';
import { icono } from '../iconos.js';
import { formatoCantidad, formatoDinero } from '../money.js';
import { aviso, estadoVacio, h } from '../ui.js';
import { abrirHojaAdelanto, abrirHojaPago } from '../hojas.js';

const PERIODOS = [
  { id: 'semana', rotulo: 'Esta semana' },
  { id: 'mes', rotulo: 'Este mes' },
  { id: 'todo', rotulo: 'Todo' },
];
const FILTROS = [
  { id: 'todo', rotulo: 'Todo' },
  { id: 'negocio', rotulo: 'Negocio' },
  { id: 'casa', rotulo: 'Casa', clase: 'casa' },
];
const CLAVE_PERIODO = 'resumen.periodo';
const CLAVE_FILTRO = 'resumen.filtro';

// Lo elegido se recuerda mientras la app está abierta (al volver de una venta o un gasto se ve lo mismo).
// Si el navegador no deja usar sessionStorage, la pantalla funciona igual con los valores de siempre.
function leerEleccion(clave, opciones, porDefecto) {
  try {
    const guardado = sessionStorage.getItem(clave);
    return opciones.some((o) => o.id === guardado) ? guardado : porDefecto;
  } catch (noDisponible) {
    return porDefecto;
  }
}

function guardarEleccion(clave, valor) {
  try {
    sessionStorage.setItem(clave, valor);
  } catch (noDisponible) {
    // sin sessionStorage solo se pierde el recuerdo
  }
}

// Botones que se eligen de a uno (período y filtro). `grupo` y el id forman data-foco, para devolver el foco al redibujar.
function selector({ etiqueta, grupo, opciones, actual, alElegir }) {
  return h('div', { class: 'segmentado compacto', role: 'group', 'aria-label': etiqueta },
    opciones.map((o) => h('button', {
      class: o.clase ?? null,
      type: 'button',
      'aria-pressed': String(o.id === actual),
      'data-foco': `${grupo}-${o.id}`,
      onclick: () => alElegir(o.id),
    }, o.rotulo)));
}

// Una tarjeta de total: círculo con ícono, rótulo y cifra grande. `clase`: ingreso, gasto, casa o acento (color del ícono y la cifra).
const kpi = (clase, nombreIcono, rotulo, monto) =>
  h('div', { class: `kpi ${clase}` },
    h('span', { class: 'kpi-icono' }, icono(nombreIcono, { tam: 26 })),
    h('span', { class: 'kpi-rotulo' }, rotulo),
    h('strong', { class: 'kpi-cifra' }, formatoDinero(monto)));

// Verde si no es negativo, rojo si sí.
const verdeORojo = (monto) => (monto >= 0 ? 'ingreso' : 'gasto');

const cifraFila = (clase, nombreIcono, rotulo, cantidad) =>
  h('div', { class: 'cifra-fila' },
    h('span', { class: clase ? `circulo ${clase}` : 'circulo' }, icono(nombreIcono)),
    h('span', { class: 'cifra-rotulo' }, rotulo),
    h('strong', {}, formatoCantidad(cantidad)));

// Un producto: ladrillos hechos por los peones y vendidos en el período (solo registros, no se restan).
function bloqueProducto(producto) {
  return h('div', { class: 'producto' },
    h('h3', {}, icono('ladrillo', { tam: 22 }), producto.nombre),
    cifraFila('acento', 'ladrillo', 'Hechos', producto.hechos),
    cifraFila('ingreso', 'venta', 'Vendidos', producto.vendidos));
}

// Una fila de la columna de movimientos. Venta y gasto llevan a su pantalla; adelanto y pago abren su hoja.
function filaMovimiento(m, alTocar) {
  const contenido = [
    h('span', { class: 'movimiento-icono' }, icono(m.entra ? 'flecha-entra' : 'flecha-sale', { tam: 24 })),
    h('span', { class: 'movimiento-texto' },
      h('span', { class: 'movimiento-descripcion' }, m.descripcion),
      h('span', { class: 'movimiento-detalle' },
        h('span', {}, formatoFecha(m.fecha)),
        h('span', { class: `etiqueta ${m.ambito}` }, icono(m.ambito === 'casa' ? 'casa' : 'fabrica', { tam: 14 }), m.ambito === 'casa' ? 'CASA' : 'NEGOCIO'))),
    h('strong', { class: 'movimiento-monto' }, `${m.entra ? '+' : '−'}${formatoDinero(m.monto)}`),
  ];
  const clase = `movimiento ${m.entra ? 'ingreso' : 'gasto'}`;
  if (m.origen === 'venta' || m.origen === 'gasto') {
    return h('a', { class: clase, href: `#/${m.origen}/${encodeURIComponent(m.refId)}` }, contenido);
  }
  return h('button', { class: clase, type: 'button', onclick: () => alTocar(m) }, contenido);
}

export async function mostrar(el, params) {
  let datos = await cargarTodo();
  let periodo = leerEleccion(CLAVE_PERIODO, PERIODOS, 'semana');
  let filtro = leerEleccion(CLAVE_FILTRO, FILTROS, 'todo');
  let respaldando = false;

  // Dos zonas: arriba (aviso, período, totales y ladrillos) y abajo (filtro y movimientos).
  // Cambiar el filtro solo redibuja la de abajo.
  const arriba = h('div');
  const abajo = h('div');
  // h() ignora los null y aplana las listas; replaceChildren los escribiría como texto ("null").
  const llenar = (zona, hijos) => zona.replaceChildren(h('div', {}, hijos));
  const devolverFoco = (foco) => foco && el.querySelector(`[data-foco="${foco}"]`)?.focus();

  async function recargar() {
    datos = await cargarTodo();
    dibujarArriba();
    dibujarAbajo();
  }
  const recargarSinFalla = () => recargar().catch((error) => console.error(error));

  function elegirPeriodo(id) {
    periodo = id;
    guardarEleccion(CLAVE_PERIODO, id);
    dibujarArriba();
    dibujarAbajo();
    devolverFoco(`periodo-${id}`);
  }

  function elegirFiltro(id) {
    filtro = id;
    guardarEleccion(CLAVE_FILTRO, id);
    dibujarAbajo();
    devolverFoco(`filtro-${id}`);
  }

  async function alHacerRespaldo(boton) {
    if (respaldando) return;
    respaldando = true;
    boton.disabled = true;
    let resultado;
    try {
      resultado = await hacerRespaldo();
    } catch (error) {
      respaldando = false;
      boton.disabled = false;
      if (error?.name === 'AbortError') return; // cerró el menú de compartir: no es una falla
      console.error(error);
      aviso('No se pudo hacer el respaldo. Intenta de nuevo.');
      return;
    }
    aviso(resultado === 'compartido' ? 'Respaldo compartido' : 'Respaldo descargado');
    respaldando = false;
    await recargarSinFalla(); // ya anotó la fecha: el recordatorio desaparece
  }

  // Al tocar un adelanto o un pago se busca el registro completo; las hojas se encargan de editar o borrar.
  function abrirMovimiento(m) {
    if (m.origen === 'adelanto') {
      const adelanto = datos.adelantos.find((a) => a.id === m.refId);
      if (adelanto) abrirHojaAdelanto(adelanto, datos, recargarSinFalla);
    } else if (m.origen === 'pago') {
      const pago = datos.pagos.find((p) => p.id === m.refId);
      if (pago) abrirHojaPago(pago, datos, recargarSinFalla);
    }
  }

  function dibujarArriba() {
    const rango = rangoPeriodo(periodo, hoy());
    // Los totales son siempre de todos los movimientos del período: el filtro solo cambia lo que se ve en la columna.
    const total = totales(movimientos(datos, rango));
    const ladrillos = resumenLadrillos(datos, rango);
    const ultimoRespaldo = datos.ajustes.ultimoRespaldo;

    let botonRespaldo = null;
    if (necesitaRespaldo(ultimoRespaldo, Date.now())) {
      botonRespaldo = h('button', { class: 'boton-principal', type: 'button', onclick: () => alHacerRespaldo(botonRespaldo) },
        icono('compartir'), 'Hacer respaldo');
    }

    llenar(arriba, [
      botonRespaldo
        ? h('div', { class: 'alerta', role: 'status' },
            icono('alerta', { tam: 28 }),
            h('div', { class: 'alerta-cuerpo' },
              h('strong', {}, ultimoRespaldo == null ? 'Todavía no has hecho ningún respaldo' : 'Hace 7 días o más que no haces respaldo'),
              botonRespaldo))
        : null,
      selector({ etiqueta: 'Período', grupo: 'periodo', opciones: PERIODOS, actual: periodo, alElegir: elegirPeriodo }),
      h('div', { class: 'kpis' },
        kpi('ingreso', 'venta', 'Ventas', total.ventas),
        kpi('gasto', 'fabrica', 'Gastos del negocio', total.gastosNegocio),
        kpi('casa', 'casa', 'Gastos de la casa', total.gastosCasa),
        kpi(verdeORojo(total.ganancia), 'resumen', 'Ganancia del negocio', total.ganancia),
        kpi(verdeORojo(total.queda), total.queda >= 0 ? 'flecha-entra' : 'flecha-sale', 'Lo que queda', total.queda)),
      ladrillos.length === 0 ? null : h('div', { class: 'tarjeta produccion' },
        ladrillos.map(bloqueProducto)),
    ]);
  }

  function dibujarAbajo() {
    const rango = rangoPeriodo(periodo, hoy());
    const lista = movimientos(datos, rango, filtro);
    llenar(abajo, [
      h('h3', {}, 'Movimientos'),
      selector({ etiqueta: 'Mostrar', grupo: 'filtro', opciones: FILTROS, actual: filtro, alElegir: elegirFiltro }),
      lista.length === 0
        ? estadoVacio({ titulo: 'No hay movimientos en este período' })
        : h('div', { class: 'lista-filas' }, lista.map((m) => filaMovimiento(m, abrirMovimiento))),
    ]);
  }

  dibujarArriba();
  dibujarAbajo();
  el.append(arriba, abajo);
}
