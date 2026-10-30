// Gasto: registra o corrige un gasto del negocio o de la casa. params = [] para uno nuevo o [id] para editarlo.

import { cargarTodo, guardar, borrar } from '../db.js';
import { esFechaValida, hoy } from '../fechas.js';
import { icono, iconoTipoGasto } from '../iconos.js';
import { aTextoEntrada, formatoDinero, parseMonto } from '../money.js';
import { abrirHoja, agregarEco, aviso, campo, claveNombre, confirmar, h, ir } from '../ui.js';

const AMBITOS = [
  { id: 'negocio', rotulo: 'Negocio', icono: 'fabrica' },
  { id: 'casa', rotulo: 'Casa', icono: 'casa' },
];

// Hoja que pide el nombre de un tipo nuevo. `alCrear(tipo)` se llama con el tipo ya guardado.
function pedirNombreTipo(tipos, ambito, alCrear) {
  const nombre = campo({ etiqueta: 'Nombre del tipo' });
  let hoja = null;
  let guardando = false;

  async function crear() {
    const texto = nombre.input.value.trim();
    if (texto === '') return nombre.error('Escribe el nombre del tipo');
    if (tipos.some((t) => t.activo && t.ambito === ambito && claveNombre(t.nombre) === claveNombre(texto))) {
      return nombre.error('Ese tipo ya existe');
    }
    if (guardando) return;
    guardando = true;
    try {
      const tipo = await guardar('tiposGasto', { nombre: texto, ambito, activo: true });
      hoja.cerrar();
      alCrear(tipo);
    } catch (error) {
      console.error(error);
      guardando = false;
      nombre.error('No se pudo guardar. Intenta de nuevo.');
    }
  }

  nombre.input.addEventListener('input', () => nombre.error(''));
  nombre.input.addEventListener('keydown', (evento) => evento.key === 'Enter' && crear());
  hoja = abrirHoja(ambito === 'casa' ? 'Nuevo tipo de gasto de la casa' : 'Nuevo tipo de gasto del negocio', [
    nombre.el,
    h('button', { class: 'boton-principal', type: 'button', onclick: crear }, icono('check'), 'Guardar tipo'),
  ]);
  nombre.input.focus();
}

export async function mostrar(el, params) {
  const { tiposGasto: tipos, gastos } = await cargarTodo();
  const original = params[0] ? gastos.find((g) => g.id === params[0]) : null;
  if (params[0] && !original) {
    el.append(h('h2', {}, 'Gasto'), h('p', { class: 'error-grande' }, 'No se encontró este gasto. Puede que ya se haya borrado.'));
    return;
  }

  let ambito = original ? original.ambito : 'negocio';
  let tipoId = original ? original.tipoId : null;
  let guardando = false;
  const tipoPorId = (id) => tipos.find((t) => t.id === id);
  // Los tipos quitados no se ofrecen, salvo el que ya tiene este gasto (así se puede guardar sin cambiarlo).
  const tiposDe = (a) => tipos.filter((t) => t.ambito === a && (t.activo || (original && t.id === original.tipoId)));

  // --- Ámbito y tipos ---
  const botonesAmbito = AMBITOS.map((a) =>
    h('button', { class: a.id, type: 'button', onclick: () => elegirAmbito(a.id) }, icono(a.icono), a.rotulo)
  );
  const zonaTipos = h('div', { class: 'fichas' });
  // La ficha "+ Nuevo tipo" va al final de la rejilla; los tipos que crea el dueño usan el ícono de etiqueta.
  const fichaNueva = h('button', { class: 'nuevo', type: 'button', onclick: nuevoTipo }, icono('etiqueta', { tam: 32 }), '+ Nuevo tipo');
  const errorTipo = h('p', { class: 'error', role: 'alert', hidden: true }, 'Elige un tipo de gasto');
  const grupoTipos = h(
    'div',
    { class: 'campo', role: 'group', 'aria-labelledby': 'rotulo-tipo' },
    h('span', { class: 'rotulo', id: 'rotulo-tipo' }, 'Tipo'),
    zonaTipos,
    errorTipo
  );

  function dibujarTipos() {
    AMBITOS.forEach((a, i) => botonesAmbito[i].setAttribute('aria-pressed', String(a.id === ambito)));
    zonaTipos.className = ambito === 'casa' ? 'fichas casa' : 'fichas';
    const lista = tiposDe(ambito);
    zonaTipos.replaceChildren(
      ...lista.map((t) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(t.id === tipoId),
          onclick: () => elegirTipo(t.id),
        }, icono(iconoTipoGasto(t.nombre), { tam: 32 }), t.nombre)
      )
    );
    if (lista.length === 0) zonaTipos.append(h('p', { class: 'ayuda' }, 'Todavía no hay tipos. Toca + Nuevo tipo.'));
    zonaTipos.append(fichaNueva);
  }

  function elegirTipo(id) {
    tipoId = id;
    errorTipo.hidden = true;
    dibujarTipos();
  }

  function elegirAmbito(nuevo) {
    ambito = nuevo;
    if (tipoId && tipoPorId(tipoId)?.ambito !== nuevo) tipoId = null; // el tipo elegido era del otro ámbito
    dibujarTipos();
  }

  function nuevoTipo() {
    pedirNombreTipo(tipos, ambito, (tipo) => {
      tipos.push(tipo);
      elegirTipo(tipo.id);
    });
  }

  // --- Valor, nota y fecha ---
  const monto = campo({ etiqueta: 'Valor', tipo: 'monto', valor: original ? aTextoEntrada(original.monto) : '' });
  monto.el.classList.add('campo-grande');
  const ecoMonto = agregarEco(monto, parseMonto, formatoDinero);
  const nota = campo({ etiqueta: 'Nota (opcional)', valor: original ? original.nota : '' });
  const fecha = campo({ etiqueta: 'Fecha', tipo: 'fecha', valor: original ? original.fecha : hoy() });
  monto.input.addEventListener('input', () => monto.error(''));
  fecha.input.addEventListener('input', () => fecha.error(''));

  // --- Guardar y borrar ---
  const botonGuardar = h('button', { class: 'boton-principal', type: 'button', onclick: alGuardar }, icono('check'), original ? 'Guardar cambios' : 'Guardar');
  const botonBorrar = original ? h('button', { class: 'boton-peligro', type: 'button', onclick: alBorrar }, icono('borrar'), 'Borrar') : null;

  async function alGuardar() {
    if (guardando) return;
    const valor = parseMonto(monto.input.value);
    const tipoBien = tipoId !== null && tipoPorId(tipoId)?.ambito === ambito;
    const fechaBien = esFechaValida(fecha.input.value);
    errorTipo.hidden = tipoBien;
    monto.error(valor === null || valor <= 0 ? 'Escribe cuánto costó' : '');
    fecha.error(fechaBien ? '' : 'Elige la fecha');
    if (!tipoBien) return grupoTipos.scrollIntoView({ block: 'center' });
    if (valor === null || valor <= 0) return monto.input.focus();
    if (!fechaBien) return fecha.input.focus();

    const datos = { ambito, tipoId, nota: nota.input.value.trim(), monto: valor, fecha: fecha.input.value };
    guardando = true;
    botonGuardar.disabled = true;
    try {
      await guardar('gastos', original ? { ...original, ...datos } : datos);
      if (original) {
        aviso('Cambios guardados');
        ir('/resumen');
      } else {
        aviso('Gasto guardado');
        limpiar();
      }
    } catch (error) {
      console.error(error);
      aviso('No se pudo guardar. Intenta de nuevo.');
    } finally {
      guardando = false;
      botonGuardar.disabled = false;
    }
  }

  async function alBorrar() {
    const nombreTipo = tipoPorId(original.tipoId)?.nombre ?? 'este tipo';
    if (!(await confirmar(`¿Borrar el gasto de ${nombreTipo} por ${formatoDinero(original.monto)}?`, { si: 'Borrar' }))) return;
    try {
      await borrar('gastos', original.id);
      aviso('Gasto borrado');
      ir('/resumen');
    } catch (error) {
      console.error(error);
      aviso('No se pudo borrar. Intenta de nuevo.');
    }
  }

  // Deja el formulario listo para otro gasto; se queda en el mismo ámbito.
  function limpiar() {
    tipoId = null;
    monto.input.value = '';
    ecoMonto();
    nota.input.value = '';
    fecha.input.value = hoy();
    dibujarTipos();
    window.scrollTo(0, 0);
  }

  dibujarTipos();
  el.append(
    h('h2', {}, original ? 'Editar gasto' : 'Nuevo gasto'),
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Ámbito del gasto' }, botonesAmbito),
    grupoTipos,
    monto.el,
    nota.el,
    fecha.el,
    h('div', { class: 'acciones' }, botonGuardar, botonBorrar)
  );
}
