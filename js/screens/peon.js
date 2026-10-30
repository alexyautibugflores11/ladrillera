// Peón: ficha, adelantos pendientes e historial de pagos. params = [id].

import { borrar, cargarTodo, guardar } from '../db.js';
import { adelantosPendientes, pagoDeLaSemana, peonTieneHistorial } from '../calc.js';
import { formatoFecha, hoy } from '../fechas.js';
import { icono } from '../iconos.js';
import { formatoDinero } from '../money.js';
import { abrirHoja, aviso, confirmar, h, ir } from '../ui.js';
import { abrirHojaAdelanto, abrirHojaPago, trabajoDe } from '../hojas.js';
import { TIPOS, abrirHojaPeon } from './peones.js';

// Del más nuevo al más viejo: por fecha y, si empatan, por orden de creación.
const masNuevoPrimero = (a, b) => (a.fecha === b.fecha ? (b.creado ?? 0) - (a.creado ?? 0) : a.fecha < b.fecha ? 1 : -1);

const fila = (alTocar, circulo, texto, lado) => h('button', { class: 'fila', type: 'button', onclick: alTocar }, circulo, h('span', { class: 'texto' }, texto), lado);

// Borra o desactiva al peón y vuelve a la lista. Si falla, se queda aquí.
async function terminarQuitar(accion, mensaje) {
  try {
    await accion();
  } catch (error) {
    console.error(error);
    return aviso('No se pudo quitar. Intenta de nuevo.');
  }
  aviso(mensaje);
  ir('/peones');
}

// Cerrar la hoja sin elegir no quita a nadie.
function preguntarPagarAntes(peon) {
  const hoja = abrirHoja(`Quitar a ${peon.nombre}`, [
    h('p', { class: 'mensaje-confirmar' }, '¿Pagarle la semana antes de quitarlo?'),
    h('p', { class: 'mensaje-confirmar' }, 'Después de pagarle, toca Quitar otra vez.'),
    h('div', { class: 'acciones' },
      h('button', { class: 'boton-principal', type: 'button', onclick: () => { hoja.cerrar(); ir(`/pagar/${encodeURIComponent(peon.id)}`); } }, icono('venta'), 'Pagar primero'),
      h('button', { class: 'boton-peligro', type: 'button', onclick: () => {
        hoja.cerrar();
        terminarQuitar(() => guardar('peones', { ...peon, activo: false }), 'Peón quitado');
      } }, icono('borrar'), 'Quitar sin pagar'),
      h('button', { class: 'boton-secundario', type: 'button', onclick: () => hoja.cerrar() }, 'Cancelar')),
  ]);
}

async function quitar(peon, datos) {
  if (!peonTieneHistorial(peon.id, datos)) {
    if (await confirmar(`¿Borrar a ${peon.nombre}? Todavía no tiene pagos ni adelantos.`, { si: 'Borrar' })) {
      await terminarQuitar(() => borrar('peones', peon.id), 'Peón borrado');
    }
    return;
  }
  if (pagoDeLaSemana(datos.pagos, peon.id, hoy()) === null || adelantosPendientes(datos.adelantos, peon.id) > 0) {
    return preguntarPagarAntes(peon);
  }
  if (await confirmar(`¿Quitar a ${peon.nombre}? Sus pagos y adelantos se conservan.`, { si: 'Quitar' })) {
    await terminarQuitar(() => guardar('peones', { ...peon, activo: false }), 'Peón quitado');
  }
}

export async function mostrar(el, params) {
  async function dibujar() {
    const datos = await cargarTodo();
    const peon = datos.peones.find((p) => p.id === params[0]);
    if (!peon) {
      el.replaceChildren(h('p', { class: 'error-grande' }, 'No se encontró este peón. Puede que ya se haya borrado.'));
      return;
    }
    const redibujar = () => dibujar().catch((error) => console.error(error));
    const pendientes = datos.adelantos.filter((a) => a.peonId === peon.id && a.pagoId == null).sort(masNuevoPrimero);
    const pagos = datos.pagos.filter((p) => p.peonId === peon.id).sort(masNuevoPrimero);
    const nuevoAdelanto = { peonId: peon.id, ambito: peon.ambito, pagoId: null, arrastre: false };

    const tipoPeon = TIPOS.find((t) => t.id === peon.tipo);

    el.replaceChildren(h('div', {},
      h('div', { class: 'tarjeta cabecera-peon' },
        h('span', { class: `circulo grande ${peon.ambito === 'casa' ? 'casa' : 'acento'}` }, icono(tipoPeon?.icono ?? 'usuario', { tam: 30 })),
        h('div', { class: 'info' },
          h('h2', {}, peon.nombre),
          h('span', { class: 'tipo-texto' }, tipoPeon?.rotulo ?? peon.tipo),
          peon.tipo === 'semanal' && peon.sueldoSemanal != null ? h('span', {}, `Sueldo semanal: ${formatoDinero(peon.sueldoSemanal)}`) : null,
          h('span', {}, 'Trabaja para: ', h('span', { class: `etiqueta ${peon.ambito}` }, icono(peon.ambito === 'casa' ? 'casa' : 'fabrica', { tam: 14 }), peon.ambito === 'casa' ? 'CASA' : 'NEGOCIO')))),
      peon.activo
        ? h('div', { class: 'acciones' },
            h('button', { class: 'boton-secundario', type: 'button', onclick: () => abrirHojaAdelanto(nuevoAdelanto, datos, redibujar) }, icono('venta'), '+ Adelanto'),
            h('a', { class: 'boton-principal', href: `#/pagar/${encodeURIComponent(peon.id)}` }, icono('calendario'), 'Pagar semana'),
            h('div', { class: 'fila-botones' },
              h('button', { class: 'boton-secundario', type: 'button', onclick: () => abrirHojaPeon(peon, redibujar) }, icono('editar'), 'Editar'),
              h('button', { class: 'boton-peligro', type: 'button', onclick: () => quitar(peon, datos) }, icono('borrar'), 'Quitar')))
        : h('p', { class: 'nota' }, 'Este peón está quitado. Puedes volver a activarlo en Ajustes.'),
      h('h3', {}, `Adelantos pendientes: ${formatoDinero(adelantosPendientes(datos.adelantos, peon.id))}`),
      h('div', { class: 'lista-filas' },
        pendientes.length === 0 ? h('p', { class: 'vacio' }, 'No tiene adelantos pendientes.') : null,
        pendientes.map((a) => fila(() => abrirHojaAdelanto(a, datos, redibujar),
          h('span', { class: 'circulo ambar' }, icono('reloj')),
          [h('strong', {}, formatoFecha(a.fecha)), a.arrastre ? h('span', { class: 'detalle' }, 'Viene de lo que no se descontó') : null],
          h('strong', { class: 'lado por-pagar' }, formatoDinero(a.monto))))),
      h('h3', {}, 'Historial'),
      h('div', { class: 'lista-filas' },
        pagos.length === 0 ? h('p', { class: 'vacio' }, 'Todavía no tiene pagos.') : null,
        pagos.map((p) => fila(() => abrirHojaPago(p, datos, redibujar),
          h('span', { class: 'circulo ingreso' }, icono('check')),
          [h('strong', {}, formatoFecha(p.fecha)),
            trabajoDe(p) ? h('span', { class: 'trabajo' }, icono(p.tipo === 'produccion' ? 'ladrillo' : 'calendario', { tam: 18 }), trabajoDe(p)) : null,
            h('span', { class: 'detalle' }, `Ganado ${formatoDinero(p.ganado)} · Descontado ${formatoDinero(p.descontado)}`)],
          h('span', { class: 'lado pagado' }, h('span', { class: 'detalle' }, 'Pagado'), h('strong', {}, formatoDinero(p.pagado))))))
    ));
  }
  await dibujar();
}
