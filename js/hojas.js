// Hojas compartidas: la de un adelanto y la de un pago. Las usan la pantalla del peón y el Resumen.
// `datos` es lo que devuelve cargarTodo(); `alCambiar()` se llama después de guardar o borrar, para que quien abrió la hoja se redibuje.

import { aplicar, borrar, guardar } from './db.js';
import { planificarBorrarPago, puedeBorrarPago } from './calc.js';
import { esFechaValida, formatoFecha, hoy } from './fechas.js';
import { icono } from './iconos.js';
import { aTextoEntrada, formatoCantidad, formatoDinero, parseMonto } from './money.js';
import { abrirHoja, agregarEco, aviso, campo, confirmar, h } from './ui.js';

const nombreDe = (datos, peonId) => datos.peones.find((p) => p.id === peonId)?.nombre ?? 'este peón';

// Una línea "Título ... valor" con los datos de una hoja. `tono` pinta el monto: 'pagado' (verde, y la fila se agranda) o 'aviso' (ámbar).
const dato = (titulo, valor, tono) =>
  h('div', { class: tono === 'pagado' ? 'dato total' : 'dato' }, h('span', {}, titulo), h('strong', { class: tono ? `tono-${tono}` : null }, valor));

// Lo trabajado en un pago: "7.500 ladrillos", "6 días", o '' si el peón es semanal.
export function trabajoDe(pago) {
  if (pago.tipo === 'produccion') {
    const total = (pago.produccion ?? []).reduce((suma, linea) => suma + linea.cantidad, 0);
    return `${formatoCantidad(total)} ${total === 1 ? 'ladrillo' : 'ladrillos'}`;
  }
  if (pago.tipo === 'diario') return `${pago.dias} ${pago.dias === 1 ? 'día' : 'días'}`;
  return '';
}

// Adelanto. Si `adelanto` no tiene id es uno nuevo ({peonId, ambito, pagoId: null, arrastre: false}).
// Un adelanto pendiente se edita o se borra; uno ya descontado o de arrastre solo se muestra.
export function abrirHojaAdelanto(adelanto, datos, alCambiar) {
  const nuevo = adelanto.id === undefined;
  const nombre = nombreDe(datos, adelanto.peonId);
  const pagoDescuento = adelanto.pagoId == null ? null : datos.pagos.find((p) => p.id === adelanto.pagoId);
  const origen = adelanto.arrastre ? datos.pagos.find((p) => p.id === adelanto.origenPagoId) : null;

  if (adelanto.arrastre === true || adelanto.pagoId != null) {
    abrirHoja(`Adelanto de ${nombre}`, [
      dato('Monto', formatoDinero(adelanto.monto), adelanto.pagoId == null ? 'aviso' : null),
      dato('Fecha', formatoFecha(adelanto.fecha)),
      adelanto.arrastre ? h('p', { class: 'hoja-texto' }, `Viene de lo que no se descontó el ${formatoFecha(origen?.fecha ?? adelanto.fecha)}`) : null,
      adelanto.pagoId == null ? null : h('p', { class: 'hoja-texto' }, pagoDescuento
        ? `Este adelanto ya se descontó en el pago del ${formatoFecha(pagoDescuento.fecha)}. Para corregirlo, borra ese pago.`
        : 'Este adelanto ya se descontó en un pago. Para corregirlo, borra ese pago.'),
    ]);
    return;
  }

  const monto = campo({ etiqueta: 'Monto', tipo: 'monto', valor: nuevo ? '' : aTextoEntrada(adelanto.monto) });
  monto.el.classList.add('campo-grande');
  agregarEco(monto, parseMonto, formatoDinero);
  const fecha = campo({ etiqueta: 'Fecha', tipo: 'fecha', valor: adelanto.fecha ?? hoy() });
  monto.input.addEventListener('input', () => monto.error(''));
  fecha.input.addEventListener('input', () => fecha.error(''));
  const botonGuardar = h('button', { class: 'boton-principal', type: 'button', onclick: alGuardar }, icono('check'), nuevo ? 'Guardar adelanto' : 'Guardar cambios');
  let guardando = false;
  let hoja = null;

  async function alGuardar() {
    if (guardando) return;
    const valor = parseMonto(monto.input.value);
    const montoBien = valor !== null && valor > 0;
    const fechaBien = esFechaValida(fecha.input.value);
    monto.error(montoBien ? '' : 'Escribe cuánto es el adelanto');
    fecha.error(fechaBien ? '' : 'Elige la fecha');
    if (!montoBien) return monto.input.focus();
    if (!fechaBien) return fecha.input.focus();
    guardando = true;
    botonGuardar.disabled = true;
    try {
      await guardar('adelantos', { ...adelanto, monto: valor, fecha: fecha.input.value });
    } catch (error) {
      console.error(error);
      aviso('No se pudo guardar. Intenta de nuevo.');
      guardando = false;
      botonGuardar.disabled = false;
      return;
    }
    aviso(nuevo ? 'Adelanto guardado' : 'Cambios guardados');
    hoja.cerrar();
    alCambiar();
  }

  async function alBorrar() {
    if (!(await confirmar(`¿Borrar el adelanto de ${formatoDinero(adelanto.monto)} a ${nombre}?`, { si: 'Borrar' }))) return;
    try {
      await borrar('adelantos', adelanto.id);
    } catch (error) {
      console.error(error);
      return aviso('No se pudo borrar. Intenta de nuevo.');
    }
    aviso('Adelanto borrado');
    hoja.cerrar();
    alCambiar();
  }

  hoja = abrirHoja(nuevo ? `Adelanto para ${nombre}` : `Adelanto de ${nombre}`, [
    monto.el,
    fecha.el,
    h('div', { class: 'acciones' }, botonGuardar,
      nuevo ? null : h('button', { class: 'boton-peligro', type: 'button', onclick: alBorrar }, icono('borrar'), 'Borrar')),
  ]);
  monto.input.focus();
}

// Pago ya hecho. Solo se puede borrar el último pago que se anotó de ese peón (no el de fecha más nueva): sus adelantos vuelven a quedar pendientes
// y el arrastre que creó se elimina, todo en una sola transacción.
export function abrirHojaPago(pago, datos, alCambiar) {
  const nombre = nombreDe(datos, pago.peonId);
  const trabajo = trabajoDe(pago);
  const quedo = pago.adelantosPendientes - pago.descontado;
  const lineas = pago.produccion ?? [];
  const productoDe = (id) => datos.productos.find((p) => p.id === id)?.nombre ?? '?';

  async function alBorrar() {
    if (!(await confirmar(`¿Borrar el pago de ${formatoDinero(pago.pagado)} a ${nombre}? Sus adelantos vuelven a quedar pendientes.`, { si: 'Borrar pago' }))) return;
    const plan = planificarBorrarPago(pago, datos.adelantos);
    try {
      await aplicar([
        { store: 'pagos', borrar: pago.id },
        ...plan.adelantosLiberados.map((a) => ({ store: 'adelantos', guardar: a })),
        ...plan.arrastreIds.map((id) => ({ store: 'adelantos', borrar: id })),
      ]);
    } catch (error) {
      console.error(error);
      return aviso('No se pudo borrar. Intenta de nuevo.');
    }
    aviso('Pago borrado');
    hoja.cerrar();
    alCambiar();
  }

  const hoja = abrirHoja(`Pago de ${nombre}`, [
    dato('Fecha', formatoFecha(pago.fecha)),
    dato('Gasto de', h('span', { class: pago.ambito === 'casa' ? 'etiqueta casa' : 'etiqueta negocio' },
      icono(pago.ambito === 'casa' ? 'casa' : 'fabrica', { tam: 14 }), pago.ambito === 'casa' ? 'Casa' : 'Negocio')),
    trabajo ? dato(pago.tipo === 'produccion' ? 'Hizo' : 'Trabajó', trabajo) : null,
    lineas.length > 1 ? lineas.map((l) => dato(productoDe(l.productoId), formatoCantidad(l.cantidad))) : null,
    dato('Ganado', formatoDinero(pago.ganado)),
    dato('Descontado', formatoDinero(pago.descontado), 'aviso'),
    quedo > 0 ? dato('Quedó pendiente', formatoDinero(quedo), 'aviso') : null,
    dato('Pagado', formatoDinero(pago.pagado), 'pagado'),
    puedeBorrarPago(pago, datos.pagos)
      ? h('button', { class: 'boton-peligro', type: 'button', onclick: alBorrar }, icono('borrar'), 'Borrar pago')
      : h('p', { class: 'nota' }, 'Solo se puede borrar el último pago que anotaste de este peón.'),
  ]);
}
