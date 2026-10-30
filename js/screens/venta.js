// Venta: registra o corrige una venta de contado. params = [] para una nueva o [id] para editarla.

import { cargarTodo, guardar, borrar } from '../db.js';
import { esFechaValida, hoy } from '../fechas.js';
import { icono } from '../iconos.js';
import { aTextoEntrada, formatoCantidad, formatoDinero, formatoPrecio, parseCantidad, parseMonto } from '../money.js';
import { agregarEco, aviso, campo, confirmar, h, ir } from '../ui.js';

export async function mostrar(el, params) {
  const { productos, ventas } = await cargarTodo();
  const original = params[0] ? ventas.find((v) => v.id === params[0]) : null;
  if (params[0] && !original) {
    el.append(h('h2', {}, 'Venta'), h('p', { class: 'error-grande' }, 'No se encontró esta venta. Puede que ya se haya borrado.'));
    return;
  }

  const activos = productos.filter((p) => p.activo);
  let productoId = original ? original.productoId : activos[0]?.id;
  if (!productoId) {
    el.append(
      h('h2', {}, 'Venta'),
      h('p', { class: 'error-grande' }, 'No hay ningún producto. Agrega uno en Ajustes para anotar ventas.'),
      h('a', { class: 'boton', href: '#/ajustes' }, 'Ir a Ajustes')
    );
    return;
  }
  const precioDe = (id) => productos.find((p) => p.id === id)?.precioVenta;
  let guardando = false;
  // Último precio que puso la app sola (null al editar): si el dueño no lo cambió, un producto nuevo lo reemplaza.
  let precioAutomatico = original ? null : aTextoEntrada(precioDe(productoId));

  // --- Producto (solo si hay más de un producto activo) ---
  const elegibles = productos.filter((p) => p.activo || (original && p.id === original.productoId));
  const selector = h(
    'select',
    { class: 'caja', id: 'producto-venta', onchange: () => elegirProducto(selector.value) },
    elegibles.map((p) => h('option', { value: p.id }, p.nombre))
  );
  selector.value = productoId; // después de crear las opciones
  const campoProducto = activos.length > 1 ? h('div', { class: 'campo' }, h('label', { for: 'producto-venta' }, 'Producto'), selector) : null;

  // --- Cantidad, precio y total ---
  const cantidad = campo({ etiqueta: 'Cantidad', tipo: 'cantidad', valor: original ? original.cantidad : '' });
  cantidad.el.classList.add('campo-grande');
  const precio = campo({
    etiqueta: 'Precio por ladrillo',
    tipo: 'monto',
    valor: original ? aTextoEntrada(original.precioUnitario) : precioAutomatico,
  });
  const ecoPrecio = agregarEco(precio, parseMonto, formatoPrecio);
  const totalTexto = h('strong', {}, formatoDinero(0));
  const cliente = campo({ etiqueta: 'Cliente (opcional)', valor: original ? original.cliente : '' });
  const fecha = campo({ etiqueta: 'Fecha', tipo: 'fecha', valor: original ? original.fecha : hoy() });

  function actualizarTotal() {
    const total = (parseCantidad(cantidad.input.value) ?? 0) * (parseMonto(precio.input.value) ?? 0);
    totalTexto.textContent = formatoDinero(Number.isSafeInteger(total) ? total : 0);
  }

  function elegirProducto(id) {
    productoId = id;
    const nuevo = precioDe(id);
    if (nuevo === undefined || (precio.input.value !== '' && precio.input.value !== precioAutomatico)) return;
    precioAutomatico = aTextoEntrada(nuevo);
    precio.input.value = precioAutomatico;
    precio.error('');
    ecoPrecio();
    actualizarTotal();
  }

  cantidad.input.addEventListener('input', () => { cantidad.error(''); actualizarTotal(); });
  precio.input.addEventListener('input', () => { precio.error(''); actualizarTotal(); });
  fecha.input.addEventListener('input', () => fecha.error(''));
  actualizarTotal();

  // --- Guardar y borrar ---
  const botonGuardar = h('button', { class: 'boton-principal ingreso', type: 'button', onclick: alGuardar }, icono('check'), original ? 'Guardar cambios' : 'Guardar');
  const botonBorrar = original ? h('button', { class: 'boton-peligro', type: 'button', onclick: alBorrar }, icono('borrar'), 'Borrar') : null;

  async function alGuardar() {
    if (guardando) return;
    const ladrillos = parseCantidad(cantidad.input.value);
    const precioUnitario = parseMonto(precio.input.value);
    const cantidadBien = ladrillos !== null && ladrillos > 0;
    const precioBien = precioUnitario !== null && precioUnitario > 0;
    const total = cantidadBien && precioBien ? ladrillos * precioUnitario : null;
    const fechaBien = esFechaValida(fecha.input.value);
    cantidad.error(cantidadBien ? '' : 'Escribe cuántos ladrillos');
    precio.error(!precioBien ? 'Escribe el precio de cada ladrillo' : total !== null && !Number.isSafeInteger(total) ? 'El total es demasiado grande' : '');
    fecha.error(fechaBien ? '' : 'Elige la fecha');
    if (!cantidadBien) return cantidad.input.focus();
    if (!precioBien || !Number.isSafeInteger(total)) return precio.input.focus();
    if (!fechaBien) return fecha.input.focus();

    const datos = { productoId, cantidad: ladrillos, precioUnitario, total, cliente: cliente.input.value.trim(), fecha: fecha.input.value };
    guardando = true;
    botonGuardar.disabled = true;
    try {
      await guardar('ventas', original ? { ...original, ...datos } : datos);
      if (original) {
        aviso('Cambios guardados');
        ir('/resumen');
      } else {
        aviso('Venta guardada');
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
    const pregunta = `¿Borrar la venta de ${formatoCantidad(original.cantidad)} ladrillos por ${formatoDinero(original.total)}?`;
    if (!(await confirmar(pregunta, { si: 'Borrar' }))) return;
    try {
      await borrar('ventas', original.id);
      aviso('Venta borrada');
      ir('/resumen');
    } catch (error) {
      console.error(error);
      aviso('No se pudo borrar. Intenta de nuevo.');
    }
  }

  // Deja el formulario listo para otra venta, con el precio del producto elegido.
  function limpiar() {
    cantidad.input.value = '';
    precioAutomatico = aTextoEntrada(precioDe(productoId));
    precio.input.value = precioAutomatico;
    ecoPrecio();
    cliente.input.value = '';
    fecha.input.value = hoy();
    actualizarTotal();
    window.scrollTo(0, 0);
  }

  el.append(h('h2', {}, original ? 'Editar venta' : 'Nueva venta'));
  if (campoProducto) el.append(campoProducto); // append(null) escribiría "null" en la pantalla
  el.append(
    cantidad.el,
    precio.el,
    h('div', { class: 'total-grande ingreso' }, h('span', {}, 'Total'), totalTexto),
    cliente.el,
    fecha.el,
    h('div', { class: 'acciones' }, botonGuardar, botonBorrar)
  );
}
