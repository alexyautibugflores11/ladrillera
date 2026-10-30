// Cálculo de pagos: lo ganado, los adelantos (con sus arrastres) y el estado de la semana.
// Todo el dinero va en unidades (ver money.js). Funciones puras: no tocan la pantalla ni la base de datos,
// no leen la hora y nunca modifican lo que reciben.

import { redondearCentavo, formatoCantidad } from './money.js';
import { rangoPeriodo, enRango } from './fechas.js';

const sumar = (lista, valorDe) => lista.reduce((total, x) => total + valorDe(x), 0);

// Suma de los adelantos del peón que aún no se descontaron (incluye los arrastres).
export function adelantosPendientes(adelantos, peonId) {
  return sumar(adelantos.filter((a) => a.peonId === peonId && a.pagoId == null), (a) => a.monto);
}

// Lo ganado según el tipo de peón: producción (cantidad por pago unitario), diario (días por valor del día) o sueldo semanal.
function ganadoDe(entrada) {
  if (entrada.tipo === 'produccion') return sumar(entrada.lineas ?? [], (l) => l.cantidad * l.pagoUnitario);
  if (entrada.tipo === 'diario') return entrada.dias * entrada.valorDia;
  return entrada.sueldo;
}

// Calcula el pago de un peón. `descontar` indefinido = descontar el máximo; si no, se limita a [0, maxDescuento].
// Lo pagado se redondea al centavo y nunca es negativo; lo que no se descontó queda como arrastre.
export function calcularPago(entrada) {
  const ganado = Math.max(0, ganadoDe(entrada));
  const maxDescuento = Math.max(0, Math.min(entrada.pendientes, ganado));
  const pedido = entrada.descontar === undefined ? maxDescuento : entrada.descontar;
  const descontado = Number.isNaN(pedido) ? 0 : Math.min(Math.max(pedido, 0), maxDescuento);
  return {
    ganado,
    maxDescuento,
    descontado,
    pagado: redondearCentavo(ganado - descontado),
    arrastre: entrada.pendientes - descontado,
  };
}

// Arma lo que hay que guardar al pagar: el pago, los adelantos del peón que quedan marcados con ese pago
// y, si sobró adelanto sin descontar, un nuevo adelanto de arrastre. `creado` lo pone la base de datos.
export function planificarPago({ peon, entrada, resultado, adelantos, fecha, nuevoId }) {
  const id = nuevoId();
  const pago = {
    id,
    peonId: peon.id,
    tipo: peon.tipo,
    ambito: peon.ambito,
    fecha,
    produccion: peon.tipo === 'produccion' ? (entrada.lineas ?? []).map((l) => ({ ...l })) : [],
    dias: peon.tipo === 'diario' ? entrada.dias : null,
    valorDia: peon.tipo === 'diario' ? entrada.valorDia : null,
    ganado: resultado.ganado,
    adelantosPendientes: entrada.pendientes,
    descontado: resultado.descontado,
    pagado: resultado.pagado,
  };
  const adelantosActualizados = adelantos
    .filter((a) => a.peonId === peon.id && a.pagoId == null)
    .map((a) => ({ ...a, pagoId: id }));
  const arrastre = resultado.arrastre > 0
    ? { id: nuevoId(), peonId: peon.id, monto: resultado.arrastre, ambito: peon.ambito, fecha, pagoId: null, arrastre: true, origenPagoId: id }
    : null;
  return { pago, adelantosActualizados, arrastre };
}

// Al borrar un pago, sus adelantos vuelven a quedar pendientes y el arrastre que ese pago creó se elimina.
export function planificarBorrarPago(pago, adelantos) {
  const esArrastreDelPago = (a) => a.arrastre === true && a.origenPagoId === pago.id;
  return {
    adelantosLiberados: adelantos
      .filter((a) => a.pagoId === pago.id && !esArrastreDelPago(a))
      .map((a) => ({ ...a, pagoId: null })),
    arrastreIds: adelantos.filter(esArrastreDelPago).map((a) => a.id),
  };
}

// Solo se puede borrar el último pago que se anotó de ese peón (por orden de creación, no por fecha):
// los arrastres se encadenan en el orden en que se anotaron los pagos, así que el arrastre de un pago
// ya pudo usarse en uno anotado después, aunque ese sea de una semana anterior.
// Sin `creado` cuenta como 0; si empatan, decide el id, para que uno solo sea el último.
export function puedeBorrarPago(pago, pagos) {
  const orden = (p) => Number(p.creado) || 0;
  const esPosterior = (otro) =>
    otro.peonId === pago.peonId && (orden(otro) > orden(pago) || (orden(otro) === orden(pago) && String(otro.id) > String(pago.id)));
  return !pagos.some(esPosterior);
}

// El pago del peón en la semana (lunes a domingo) de esa fecha, o null.
export function pagoDeLaSemana(pagos, peonId, fecha) {
  const semana = rangoPeriodo('semana', fecha);
  return pagos.find((p) => p.peonId === peonId && enRango(p.fecha, semana)) ?? null;
}

// Resumen de la semana: cuántos peones activos ya cobraron, quiénes faltan, y ladrillos y dinero de todos los pagos.
export function estadoSemana(peones, pagos, fecha) {
  const semana = rangoPeriodo('semana', fecha);
  const deLaSemana = pagos.filter((p) => enRango(p.fecha, semana));
  const conPago = new Set(deLaSemana.map((p) => p.peonId));
  const activos = peones.filter((p) => p.activo === true);
  const faltan = activos.filter((p) => !conPago.has(p.id));
  return {
    activos: activos.length,
    pagados: activos.length - faltan.length,
    faltan,
    ladrillos: sumar(deLaSemana, (p) => sumar(p.produccion ?? [], (l) => l.cantidad)),
    totalPagado: sumar(deLaSemana, (p) => p.pagado),
  };
}

// --- Resumen ---

const DIA_MS = 86400000;
const nombreDe = (lista, id) => lista.find((x) => x.id === id)?.nombre ?? '?'; // incluye los inactivos
const conDetalle = (texto, detalle) => (detalle ? texto + ' – ' + detalle : texto);

// Todos los movimientos de dinero dentro del rango, del más nuevo al más viejo (fecha y luego creado).
// Cada uno trae `entra` (true solo en las ventas) y su `ambito`. Los adelantos de arrastre no cuentan:
// son un saldo pendiente, no dinero que salió. `filtro`: 'negocio', 'casa' o 'todo'.
export function movimientos(datos, rango, filtro = 'todo') {
  const mov = (origen, r, descripcion, monto, entra, ambito) =>
    ({ clave: origen + ':' + r.id, origen, refId: r.id, fecha: r.fecha, creado: r.creado ?? 0, descripcion, monto, entra, ambito });
  const delRango = (r) => enRango(r.fecha, rango);
  const lista = [
    ...datos.ventas.filter(delRango).map((v) => mov('venta', v,
      conDetalle('Venta – ' + formatoCantidad(v.cantidad) + ' ' + nombreDe(datos.productos, v.productoId), v.cliente), v.total, true, 'negocio')),
    ...datos.gastos.filter(delRango).map((g) => mov('gasto', g,
      conDetalle(nombreDe(datos.tiposGasto, g.tipoId), g.nota), g.monto, false, g.ambito)),
    ...datos.adelantos.filter((a) => a.arrastre !== true && delRango(a)).map((a) => mov('adelanto', a,
      'Adelanto – ' + nombreDe(datos.peones, a.peonId), a.monto, false, a.ambito)),
    ...datos.pagos.filter(delRango).map((p) => mov('pago', p,
      (p.tipo === 'semanal' ? 'Sueldo – ' : 'Pago semana – ') + nombreDe(datos.peones, p.peonId), p.pagado, false, p.ambito)),
  ];
  return lista
    .filter((m) => filtro === 'todo' || m.ambito === filtro)
    .sort((a, b) => (a.fecha === b.fecha ? b.creado - a.creado : (a.fecha < b.fecha ? 1 : -1)));
}

// Lo que entró (ventas), lo que salió por ámbito, la ganancia del negocio y lo que queda después de la casa.
export function totales(movs) {
  const gastos = (ambito) => sumar(movs.filter((m) => !m.entra && m.ambito === ambito), (m) => m.monto);
  const ventas = sumar(movs.filter((m) => m.entra), (m) => m.monto);
  const gastosNegocio = gastos('negocio');
  const gastosCasa = gastos('casa');
  const ganancia = ventas - gastosNegocio;
  return { ventas, gastosNegocio, gastosCasa, ganancia, queda: ganancia - gastosCasa };
}

// Por cada producto activo: ladrillos hechos (contados en los pagos) y vendidos dentro del rango,
// y los que hay en el patio: stock inicial + todo lo hecho - todo lo vendido, sin importar el rango.
export function resumenLadrillos(datos, rango) {
  const hechosEn = (pagos, productoId) =>
    sumar(pagos, (p) => sumar((p.produccion ?? []).filter((l) => l.productoId === productoId), (l) => l.cantidad));
  const vendidosEn = (ventas, productoId) => sumar(ventas.filter((v) => v.productoId === productoId), (v) => v.cantidad);
  const pagosDelRango = datos.pagos.filter((p) => enRango(p.fecha, rango));
  const ventasDelRango = datos.ventas.filter((v) => enRango(v.fecha, rango));
  return datos.productos.filter((p) => p.activo === true).map((p) => ({
    productoId: p.id,
    nombre: p.nombre,
    hechos: hechosEn(pagosDelRango, p.id),
    vendidos: vendidosEn(ventasDelRango, p.id),
    enPatio: p.stockInicial + hechosEn(datos.pagos, p.id) - vendidosEn(datos.ventas, p.id),
  }));
}

// Recordatorio de respaldo: sin respaldo nunca, o con 7 días o más desde el último (`ahora` y `ultimoRespaldo` en ms).
export function necesitaRespaldo(ultimoRespaldo, ahora) {
  return ultimoRespaldo == null || ahora - ultimoRespaldo >= 7 * DIA_MS;
}

// ¿El peón tiene adelantos o pagos? Si sí, no se puede borrar (solo desactivar).
export function peonTieneHistorial(peonId, datos) {
  return datos.adelantos.some((a) => a.peonId === peonId) || datos.pagos.some((p) => p.peonId === peonId);
}
