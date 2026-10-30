// Peones: lista de peones activos por tipo y quién falta por pagar esta semana.
// También exporta la hoja para crear o editar un peón, que usa la pantalla del peón.

import { cargarTodo, guardar } from '../db.js';
import { adelantosPendientes, estadoSemana } from '../calc.js';
import { enRango, esSabado, hoy, rangoPeriodo } from '../fechas.js';
import { icono } from '../iconos.js';
import { aTextoEntrada, formatoCantidad, formatoDinero, parseMonto } from '../money.js';
import { abrirHoja, agregarEco, aviso, campo, estadoVacio, h } from '../ui.js';

export const TIPOS = [
  { id: 'produccion', rotulo: 'Por producción', icono: 'ladrillo' },
  { id: 'diario', rotulo: 'Al diario', icono: 'calendario' },
  { id: 'semanal', rotulo: 'Semanal', icono: 'usuario' },
];
const AMBITOS = [
  { id: 'negocio', rotulo: 'Negocio', icono: 'fabrica' },
  { id: 'casa', rotulo: 'Casa', icono: 'casa' },
];

// Hoja para crear (`peon` = null) o editar un peón. `alGuardar()` se llama con el peón ya guardado.
// Cambiar tipo, ámbito o sueldo solo afecta a los pagos y adelantos nuevos: los viejos guardan su propia copia.
export function abrirHojaPeon(peon, alGuardar) {
  let tipo = peon ? peon.tipo : 'produccion';
  let ambito = peon ? peon.ambito : 'negocio';
  let guardando = false;
  let hoja = null;

  const nombre = campo({ etiqueta: 'Nombre', valor: peon ? peon.nombre : '' });
  const sueldo = campo({ etiqueta: 'Sueldo semanal', tipo: 'monto', valor: peon?.sueldoSemanal ? aTextoEntrada(peon.sueldoSemanal) : '' });
  agregarEco(sueldo, parseMonto, formatoDinero);
  nombre.input.addEventListener('input', () => nombre.error(''));
  sueldo.input.addEventListener('input', () => sueldo.error(''));
  const botonesTipo = TIPOS.map((t) => h('button', { class: 'opcion', type: 'button', onclick: () => { tipo = t.id; dibujar(); } }, icono(t.icono), t.rotulo));
  const botonesAmbito = AMBITOS.map((a) => h('button', { class: a.id, type: 'button', onclick: () => { ambito = a.id; dibujar(); } }, icono(a.icono), a.rotulo));
  const botonGuardar = h('button', { class: 'boton-principal', type: 'button', onclick: guardarPeon }, icono('check'), peon ? 'Guardar cambios' : 'Guardar peón');

  function dibujar() {
    TIPOS.forEach((t, i) => botonesTipo[i].setAttribute('aria-pressed', String(t.id === tipo)));
    AMBITOS.forEach((a, i) => botonesAmbito[i].setAttribute('aria-pressed', String(a.id === ambito)));
    sueldo.el.hidden = tipo !== 'semanal';
  }

  async function guardarPeon() {
    if (guardando) return;
    const texto = nombre.input.value.trim();
    const valor = parseMonto(sueldo.input.value);
    const sueldoBien = tipo !== 'semanal' || (valor !== null && valor > 0);
    nombre.error(texto === '' ? 'Escribe el nombre' : '');
    sueldo.error(sueldoBien ? '' : 'Escribe el sueldo semanal');
    if (texto === '') return nombre.input.focus();
    if (!sueldoBien) return sueldo.input.focus();

    const { sueldoSemanal, ...resto } = peon ?? { activo: true }; // sin sueldo anterior: solo los semanales lo llevan
    const datos = { ...resto, nombre: texto, tipo, ambito };
    if (tipo === 'semanal') datos.sueldoSemanal = valor;
    guardando = true;
    botonGuardar.disabled = true;
    try {
      await guardar('peones', datos);
    } catch (error) {
      console.error(error);
      aviso('No se pudo guardar. Intenta de nuevo.');
      guardando = false;
      botonGuardar.disabled = false;
      return;
    }
    aviso(peon ? 'Cambios guardados' : 'Peón guardado');
    hoja.cerrar();
    alGuardar();
  }

  dibujar();
  hoja = abrirHoja(peon ? 'Editar peón' : 'Nuevo peón', [
    nombre.el,
    h('div', { class: 'campo', role: 'group', 'aria-labelledby': 'rotulo-tipo-peon' },
      h('span', { class: 'rotulo', id: 'rotulo-tipo-peon' }, 'Tipo'), h('div', { class: 'opciones-tipo' }, botonesTipo)),
    sueldo.el,
    h('div', { class: 'campo', role: 'group', 'aria-labelledby': 'rotulo-ambito-peon' },
      h('span', { class: 'rotulo', id: 'rotulo-ambito-peon' }, 'Trabaja para'), h('div', { class: 'segmentado' }, botonesAmbito)),
    botonGuardar,
  ]);
  nombre.input.focus();
}

// Una tarjeta de la lista: círculo con el ícono del tipo, nombre, CASA, adelantos pendientes y si ya cobró esta semana.
// Toda la tarjeta lleva al peón.
function filaPeon(peon, datos, semana) {
  const pendiente = adelantosPendientes(datos.adelantos, peon.id);
  const pagosSemana = datos.pagos.filter((p) => p.peonId === peon.id && enRango(p.fecha, semana));
  const pagado = pagosSemana.reduce((suma, p) => suma + p.pagado, 0);
  const tipo = TIPOS.find((t) => t.id === peon.tipo);
  return h('a', { class: 'fila', href: `#/peon/${encodeURIComponent(peon.id)}` },
    h('span', { class: `circulo ${peon.ambito === 'casa' ? 'casa' : 'acento'}` }, icono(tipo?.icono ?? 'usuario', { tam: 26 })),
    h('span', { class: 'texto' },
      h('strong', { class: 'nombre' }, peon.nombre, peon.ambito === 'casa' ? [' ', h('span', { class: 'etiqueta casa' }, 'CASA')] : null),
      h('span', { class: 'detalle' }, tipo?.rotulo ?? peon.tipo),
      pendiente > 0 ? h('span', { class: 'detalle adelanto' }, `Adelantos pendientes: ${formatoDinero(pendiente)}`) : null,
      pagosSemana.length > 0
        ? h('span', { class: 'estado pagado' }, icono('check'), `Pagado ${formatoDinero(pagado)}`)
        : h('span', { class: 'estado pendiente' }, icono('reloj'), 'Por pagar')));
}

export async function mostrar(el, params) {
  async function dibujar() {
    const datos = await cargarTodo();
    const fecha = hoy();
    const estado = estadoSemana(datos.peones, datos.pagos, fecha);
    const semana = rangoPeriodo('semana', fecha);
    const activos = datos.peones.filter((p) => p.activo);
    const redibujar = () => dibujar().catch((error) => console.error(error));
    const hayQuePagar = esSabado(fecha) && estado.faltan.length > 0;

    const porcentaje = estado.activos > 0 ? Math.round((estado.pagados / estado.activos) * 100) : 0;
    const todosPagados = estado.activos > 0 && estado.pagados === estado.activos;

    // h() ignora los null y aplana las listas; replaceChildren los escribiría como texto ("null").
    el.replaceChildren(h('div', {},
      h('div', { class: 'tarjeta semana' },
        h('div', { class: todosPagados ? 'progreso completo' : 'progreso' },
          h('div', { class: 'progreso-cabecera' },
            h('span', {}, 'Esta semana'),
            h('strong', {}, `${estado.pagados} de ${estado.activos} pagados`)),
          h('div', { class: 'progreso-pista', 'aria-hidden': 'true' },
            h('div', { class: 'progreso-barra', style: `width: ${porcentaje}%` }))),
        h('div', { class: 'cifra-fila' },
          h('span', { class: 'circulo acento' }, icono('ladrillo')),
          h('span', { class: 'cifra-rotulo' }, 'ladrillos'),
          h('strong', {}, formatoCantidad(estado.ladrillos))),
        h('div', { class: 'cifra-fila' },
          h('span', { class: 'circulo ingreso' }, icono('venta')),
          h('span', { class: 'cifra-rotulo' }, 'pagado'),
          h('strong', {}, formatoDinero(estado.totalPagado)))),
      hayQuePagar
        ? h('div', { class: 'alerta', role: 'status' },
            icono('alerta', { tam: 28 }),
            h('span', {},
              h('strong', {}, 'Hoy es día de pago'),
              ` — faltan ${estado.faltan.length} por pagar: ${estado.faltan.map((p) => p.nombre).join(', ')}`))
        : null,
      h('button', { class: 'boton-principal', type: 'button', onclick: () => abrirHojaPeon(null, redibujar) }, icono('usuario'), '+ Nuevo peón'),
      activos.length === 0
        ? estadoVacio({ titulo: 'Todavía no tienes peones. Toca + Nuevo peón para agregar el primero.' })
        : TIPOS.map((tipo) => {
            const delTipo = activos.filter((p) => p.tipo === tipo.id);
            return delTipo.length === 0 ? null : h('section', { class: 'grupo' },
              h('h3', {}, icono(tipo.icono, { tam: 22 }), tipo.rotulo), h('div', { class: 'lista-filas' }, delTipo.map((p) => filaPeon(p, datos, semana))));
          })
    ));
  }
  await dibujar();
}
