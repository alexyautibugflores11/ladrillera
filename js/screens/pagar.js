// Pagar semana: el sábado el dueño anota lo que hizo el peón, elige cuánto adelanto descontar y confirma el pago. params = [id].
// Los números salen todos de calc.js; aquí solo se leen los campos, se dibuja el resumen y se guarda.

import { aplicar, cargarTodo, nuevoId } from '../db.js';
import { adelantosPendientes, calcularPago, pagoDeLaSemana, planificarPago } from '../calc.js';
import { esFechaValida, hoy } from '../fechas.js';
import { icono } from '../iconos.js';
import { aTextoEntrada, formatoDinero, parseCantidad, parseMonto } from '../money.js';
import { agregarEco, aviso, campo, confirmar, h, ir } from '../ui.js';

const MAX_DIAS = 7;
const DIAS_INICIALES = 6;
const PREGUNTA_LADRILLOS = '¿Cuántos ladrillos hizo esta semana?';

// Selector del tipo de trabajador: solo se muestra, bloqueado en el tipo del peón. El tipo es del peón y se cambia editándolo.
const TIPOS_TRABAJADOR = [
  { id: 'produccion', rotulo: 'Producción', icono: 'ladrillo' },
  { id: 'diario', rotulo: 'Diario', icono: 'calendario' },
  { id: 'semanal', rotulo: 'Semanal', icono: 'usuario' },
];

const dato = (titulo, valor) => h('div', { class: 'dato' }, h('span', {}, titulo), valor);

export async function mostrar(el, params) {
  const datos = await cargarTodo();
  const peon = datos.peones.find((p) => p.id === params[0]);
  if (!peon) {
    el.append(
      h('h2', {}, 'Pagar semana'),
      h('p', { class: 'error-grande' }, 'No se encontró este peón. Puede que ya se haya borrado.'),
      h('a', { class: 'boton ancho', href: '#/peones' }, 'Volver a Peones'));
    return;
  }

  const pendientes = adelantosPendientes(datos.adelantos, peon.id);
  const valorDia = datos.ajustes.valorDia;
  const productos = peon.tipo === 'produccion' ? datos.productos.filter((p) => p.activo) : [];
  const bloqueo = productos.length === 0 && peon.tipo === 'produccion'
    ? 'No hay ningún producto activo. Agrégalo en Ajustes.'
    : productos.some((p) => !(p.pagoPeon > 0)) ? 'Primero pon en Ajustes cuánto se paga por ladrillo'
      : peon.tipo === 'diario' && !(valorDia > 0) ? 'Primero pon en Ajustes cuánto se paga por día' : null;
  if (bloqueo) {
    el.append(h('h2', {}, `Pagar a ${peon.nombre}`), h('p', { class: 'error-grande' }, bloqueo), h('a', { class: 'boton ancho', href: '#/ajustes' }, 'Ir a Ajustes'));
    return;
  }
  let dias = DIAS_INICIALES;
  let modo = 'todo'; // 'todo' y 'nada' siguen a los botones; 'manual' es lo que se escribió en Descontar
  let guardando = false;

  // --- Lo que hizo en la semana (según el tipo) ---
  const cantidades = productos.map((producto) => {
    const c = campo({ etiqueta: productos.length > 1 ? `${PREGUNTA_LADRILLOS} (${producto.nombre})` : PREGUNTA_LADRILLOS, tipo: 'cantidad' });
    c.el.classList.add('campo-grande');
    c.input.addEventListener('input', () => { c.error(''); actualizar(); });
    return { producto, c };
  });

  const textoDias = h('strong', { class: 'valor-dias' });
  const textoCuenta = h('p', { class: 'eco centrado' });
  const errorDias = h('p', { class: 'error', role: 'alert', hidden: true });
  const menos = h('button', { class: 'boton-secundario', type: 'button', 'aria-label': 'Un día menos', onclick: () => cambiarDias(-1) }, icono('menos', { tam: 32 }));
  const mas = h('button', { class: 'boton-secundario', type: 'button', 'aria-label': 'Un día más', onclick: () => cambiarDias(1) }, icono('mas', { tam: 32 }));
  const cajaDias = { input: mas, error: (mensaje) => { errorDias.textContent = mensaje; errorDias.hidden = mensaje === ''; } };

  const sueldo = campo({ etiqueta: 'Sueldo de la semana', tipo: 'monto', valor: peon.sueldoSemanal != null ? aTextoEntrada(peon.sueldoSemanal) : '' });
  agregarEco(sueldo, parseMonto, formatoDinero);
  sueldo.input.addEventListener('input', () => { sueldo.error(''); actualizar(); });
  sueldo.el.classList.add('campo-grande');

  function cambiarDias(paso) {
    dias = Math.min(MAX_DIAS, Math.max(0, dias + paso));
    cajaDias.error('');
    actualizar();
  }

  // --- Descuento de adelantos ---
  const descontar = campo({ etiqueta: 'Descontar', tipo: 'monto' });
  const ecoDescontar = agregarEco(descontar, parseMonto, formatoDinero);
  descontar.input.addEventListener('input', () => { modo = 'manual'; descontar.error(''); actualizar(); });
  // Al salir de la caja, si lo escrito pasa del máximo, la caja se queda en el máximo: caja, resumen y lo guardado dicen lo mismo.
  descontar.input.addEventListener('blur', () => { ajustarDescuento(); actualizar(); });
  const botonesModo = [['todo', 'Todo'], ['nada', 'Nada']].map(([id, rotulo]) =>
    ({ id, el: h('button', { type: 'button', onclick: () => { modo = id; descontar.error(''); actualizar(); } }, rotulo) }));

  // --- Resumen, fecha y botón ---
  const textoGanado = h('strong');
  const textoDescontado = h('strong', { class: 'tono-aviso' });
  const textoPagar = h('strong');
  const textoArrastre = h('p', { class: 'nota' });
  const avisoYaPago = h('div', { class: 'alerta', role: 'status' }, icono('alerta', { tam: 28 }), h('span', {}, 'Ya le pagaste esta semana'));
  const fecha = campo({ etiqueta: 'Fecha del pago', tipo: 'fecha', valor: hoy() });
  fecha.input.addEventListener('input', () => { fecha.error(''); actualizar(); });
  const botonPagar = h('button', { class: 'boton-principal', type: 'button', onclick: alPagar }, icono('check'), 'Pagar');
  const selectorTipo = h('div', { class: 'segmentado tipo-fijo', role: 'group', 'aria-label': 'Tipo de trabajador' },
    TIPOS_TRABAJADOR.map((t) => h('button', { type: 'button', 'aria-pressed': String(t.id === peon.tipo), 'aria-disabled': 'true', tabindex: '-1' }, icono(t.icono), t.rotulo)));

  // Convierte lo escrito en la entrada de calcularPago. `falla` = {caja, mensaje} del primer problema, o null.
  function calcular() {
    let entrada;
    let falla = null;
    if (peon.tipo === 'produccion') {
      const lineas = [];
      for (const { producto, c } of cantidades) {
        const texto = c.input.value.trim();
        const cantidad = texto === '' ? 0 : parseCantidad(texto);
        if (cantidad === null) falla ??= { caja: c, mensaje: 'Escribe cuántos ladrillos hizo' };
        else if (cantidad > 0) lineas.push({ productoId: producto.id, cantidad, pagoUnitario: producto.pagoPeon });
      }
      if (lineas.length === 0) falla ??= { caja: cantidades[0].c, mensaje: 'Escribe cuántos ladrillos hizo' };
      entrada = { tipo: 'produccion', lineas };
    } else if (peon.tipo === 'diario') {
      if (dias === 0) falla = { caja: cajaDias, mensaje: 'Elige cuántos días trabajó' };
      entrada = { tipo: 'diario', dias, valorDia };
    } else {
      const valor = parseMonto(sueldo.input.value);
      if (!(valor > 0)) falla = { caja: sueldo, mensaje: 'Escribe el sueldo semanal' };
      entrada = { tipo: 'semanal', sueldo: valor ?? 0 };
    }
    const texto = descontar.input.value.trim();
    const escrito = texto === '' ? 0 : parseMonto(texto);
    const pedido = modo === 'todo' ? undefined : modo === 'nada' ? 0 : escrito ?? 0; // sin entender, cuenta 0 (y no deja pagar)
    const completa = { ...entrada, pendientes, descontar: pedido };
    return { entrada: completa, resultado: calcularPago(completa), falla, descuentoMalo: modo === 'manual' && escrito === null };
  }

  // Con el modo manual y un descuento mayor que el máximo, deja la caja en el máximo (y su eco al día).
  // Si todavía no hay nada ganado (falta anotar lo que hizo), no toca lo escrito: ahí no se puede pagar de todos modos.
  function ajustarDescuento() {
    if (modo !== 'manual') return;
    const { resultado } = calcular();
    const escrito = parseMonto(descontar.input.value.trim());
    if (resultado.ganado > 0 && escrito !== null && escrito > resultado.maxDescuento) {
      descontar.input.value = aTextoEntrada(resultado.maxDescuento);
      ecoDescontar();
    }
  }

  function actualizar() {
    const { resultado } = calcular();
    if (modo !== 'manual') {
      descontar.input.value = modo === 'todo' ? aTextoEntrada(resultado.maxDescuento) : '0';
      ecoDescontar();
    }
    botonesModo.forEach((b) => b.el.setAttribute('aria-pressed', String(b.id === modo)));
    textoDias.textContent = String(dias);
    textoCuenta.textContent = `× ${formatoDinero(valorDia)} = ${formatoDinero(dias * valorDia)}`;
    menos.disabled = dias <= 0;
    mas.disabled = dias >= MAX_DIAS;
    textoGanado.textContent = formatoDinero(resultado.ganado);
    textoDescontado.textContent = formatoDinero(resultado.descontado);
    textoPagar.textContent = formatoDinero(resultado.pagado);
    textoArrastre.textContent = `Quedan ${formatoDinero(resultado.arrastre)} pendientes para la próxima semana`;
    textoArrastre.hidden = !(resultado.arrastre > 0);
    avisoYaPago.hidden = !(esFechaValida(fecha.input.value) && pagoDeLaSemana(datos.pagos, peon.id, fecha.input.value));
  }

  async function alPagar() {
    if (guardando) return; // un segundo toque no abre otra pregunta ni paga dos veces
    guardando = true;
    botonPagar.disabled = true;
    let guardado = false;
    try {
      ajustarDescuento(); // por si tocó Pagar sin salir antes de la caja Descontar
      actualizar();
      const { entrada, resultado, falla, descuentoMalo } = calcular();
      const fechaBien = esFechaValida(fecha.input.value);
      if (falla) falla.caja.error(falla.mensaje);
      descontar.error(descuentoMalo ? 'Escribe cuánto descontar' : '');
      fecha.error(fechaBien ? '' : 'Elige la fecha');
      const primera = falla?.caja ?? (descuentoMalo ? descontar : fechaBien ? null : fecha);
      if (primera) return primera.input.focus();

      const yaPago = pagoDeLaSemana(datos.pagos, peon.id, fecha.input.value) !== null;
      const pregunta = yaPago ? 'Ya le pagaste esta semana. ¿Pagar otra vez?' : `¿Pagar ${formatoDinero(resultado.pagado)} a ${peon.nombre}?`;
      if (!(await confirmar(pregunta, { si: 'Pagar' }))) return;

      const plan = planificarPago({ peon, entrada, resultado, adelantos: datos.adelantos, fecha: fecha.input.value, nuevoId });
      await aplicar([
        { store: 'pagos', guardar: plan.pago },
        ...plan.adelantosActualizados.map((a) => ({ store: 'adelantos', guardar: a })),
        ...(plan.arrastre ? [{ store: 'adelantos', guardar: plan.arrastre }] : []),
      ]);
      guardado = true;
      aviso('Pago guardado');
      ir('/peones');
    } catch (error) {
      console.error(error);
      aviso('No se pudo guardar. Intenta de nuevo.');
    } finally {
      if (!guardado) {
        guardando = false;
        botonPagar.disabled = false;
      }
    }
  }

  // h() ignora los null y aplana las listas; append los escribiría como texto ("null").
  el.append(h('div', {},
    h('h2', {}, `Pagar a ${peon.nombre}`),
    avisoYaPago,
    selectorTipo,
    cantidades.map(({ c }) => c.el),
    peon.tipo === 'diario'
      ? h('div', { class: 'campo dias', role: 'group', 'aria-labelledby': 'rotulo-dias' },
          h('span', { class: 'rotulo', id: 'rotulo-dias' }, '¿Cuántos días trabajó?'),
          h('div', { class: 'contador' }, menos, textoDias, mas), textoCuenta, errorDias)
      : null,
    peon.tipo === 'semanal' ? sueldo.el : null,
    h('div', { class: 'tarjeta desglose' },
      dato('Ganado', textoGanado),
      pendientes > 0
        ? h('div', { class: 'descuento' },
            h('p', {}, h('strong', {}, `Adelantos pendientes: ${formatoDinero(pendientes)}`)),
            descontar.el,
            h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Cuánto descontar' }, botonesModo.map((b) => b.el)))
        : null,
      dato('Descontado', textoDescontado),
      h('div', { class: 'total-grande acento a-pagar', 'aria-live': 'polite' }, h('span', {}, 'A pagar'), textoPagar),
      textoArrastre),
    fecha.el,
    h('div', { class: 'acciones' }, botonPagar)));
  actualizar();
}
