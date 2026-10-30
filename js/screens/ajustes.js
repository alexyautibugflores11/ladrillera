// Ajustes: valor del día, productos, tipos de gasto, peones quitados y respaldo.
// Cambiar un precio o el valor del día solo afecta a los registros nuevos: los viejos guardan su propia copia.

import { cargarTodo, guardar, guardarAjustes, importar } from '../db.js';
import { hacerRespaldo, leerRespaldo, validarRespaldo } from '../backup.js';
import { esFechaValida, formatoFecha, hoy } from '../fechas.js';
import { icono, iconoTipoGasto } from '../iconos.js';
import { aTextoEntrada, formatoDinero, formatoPrecio, parseMonto } from '../money.js';
import { abrirHoja, agregarEco, aviso, campo, claveNombre, confirmar, estadoVacio, h, ir } from '../ui.js';

const AMBITOS = [
  { id: 'negocio', rotulo: 'Negocio', icono: 'fabrica' },
  { id: 'casa', rotulo: 'Casa', icono: 'casa' },
];
const SIN_GUARDAR = 'No se pudo guardar. Intenta de nuevo.';
const ULTIMO_PRODUCTO = 'Debe quedar al menos un producto activo';
const ARCHIVOS_RESPALDO = '.txt,.json,text/plain,application/json';

// Fecha del último respaldo (guardada como milisegundos) o "Nunca".
function textoUltimoRespaldo(milisegundos) {
  const fecha = typeof milisegundos === 'number' ? new Date(milisegundos) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? formatoFecha(hoy(fecha)) : 'Nunca';
}

// Una tarjeta del tema: título con ícono y lo que va dentro.
const tarjeta = (clase, nombreIcono, titulo, ...hijos) =>
  h('section', { class: `tarjeta ajuste ${clase}` }, h('h3', {}, icono(nombreIcono, { tam: 24 }), titulo), hijos);

// --- Hoja de producto ---

// Hoja para crear (`producto` = null) o editar un producto. `alGuardar()` se llama con el producto ya guardado.
function abrirHojaProducto(producto, productos, alGuardar) {
  let activo = producto ? producto.activo : true;
  let guardando = false;
  let hoja = null;

  const nombre = campo({ etiqueta: 'Nombre', valor: producto?.nombre ?? '' });
  const precio = campo({ etiqueta: 'Precio de venta por unidad', tipo: 'monto', valor: producto ? aTextoEntrada(producto.precioVenta) : '' });
  const pago = campo({ etiqueta: 'Pago al peón por unidad', tipo: 'monto', valor: producto ? aTextoEntrada(producto.pagoPeon) : '' });
  agregarEco(precio, parseMonto, formatoPrecio);
  agregarEco(pago, parseMonto, formatoPrecio);
  for (const c of [nombre, precio, pago]) c.input.addEventListener('input', () => c.error(''));

  // La opción Activo solo se ofrece al editar: un producto nuevo siempre empieza activo.
  const hayOtroActivo = productos.some((p) => p.activo && p.id !== producto?.id);
  const errorActivo = h('p', { class: 'error', role: 'alert', hidden: true }, ULTIMO_PRODUCTO);
  const opcionesActivo = [{ valor: true, rotulo: 'Activo', icono: 'check' }, { valor: false, rotulo: 'Inactivo', icono: 'cerrar' }];
  const botonesActivo = opcionesActivo.map((o) => h('button', { type: 'button', onclick: () => { activo = o.valor; dibujarActivo(); } }, icono(o.icono), o.rotulo));
  const campoActivo = producto
    ? h('div', { class: 'campo', role: 'group', 'aria-labelledby': 'rotulo-activo-producto' },
        h('span', { class: 'rotulo', id: 'rotulo-activo-producto' }, 'Estado'),
        h('div', { class: 'segmentado compacto' }, botonesActivo),
        errorActivo,
        h('p', { class: 'ayuda' }, 'Un producto inactivo no sale en Venta ni en Pagar semana. Sus registros se conservan.'))
    : null;

  function dibujarActivo() {
    opcionesActivo.forEach((o, i) => botonesActivo[i].setAttribute('aria-pressed', String(o.valor === activo)));
    errorActivo.hidden = activo || hayOtroActivo;
  }

  const botonGuardar = h('button', { class: 'boton-principal', type: 'button', onclick: guardarProducto }, icono('check'), producto ? 'Guardar cambios' : 'Guardar producto');

  async function guardarProducto() {
    if (guardando) return;
    const texto = nombre.input.value.trim();
    const venta = parseMonto(precio.input.value);
    const alPeon = parseMonto(pago.input.value);
    const repetido = texto !== '' && productos.some((p) => p.id !== producto?.id && claveNombre(p.nombre) === claveNombre(texto));
    const ventaBien = venta !== null && venta > 0;
    const pagoBien = alPeon !== null && alPeon > 0;
    const activoBien = activo || hayOtroActivo;

    nombre.error(texto === '' ? 'Escribe el nombre del producto' : repetido ? 'Ya hay un producto con ese nombre' : '');
    precio.error(ventaBien ? '' : 'Escribe el precio de venta');
    pago.error(pagoBien ? '' : 'Escribe cuánto se le paga al peón');
    errorActivo.hidden = activoBien;
    const primero = [
      [texto === '' || repetido, nombre.input],
      [!ventaBien, precio.input],
      [!pagoBien, pago.input],
      [!activoBien, botonesActivo[0]],
    ].find(([mal]) => mal);
    if (primero) return primero[1].focus();

    const datos = { nombre: texto, precioVenta: venta, pagoPeon: alPeon, activo };
    guardando = true;
    botonGuardar.disabled = true;
    try {
      await guardar('productos', producto ? { ...producto, ...datos } : datos);
    } catch (error) {
      console.error(error);
      guardando = false;
      botonGuardar.disabled = false;
      aviso(SIN_GUARDAR);
      return;
    }
    aviso(producto ? 'Cambios guardados' : 'Producto guardado');
    hoja.cerrar();
    alGuardar();
  }

  dibujarActivo();
  hoja = abrirHoja(producto ? 'Editar producto' : 'Nuevo producto', [nombre.el, precio.el, pago.el, campoActivo, botonGuardar]);
  if (!producto) nombre.input.focus();
}

// --- Hoja de tipo de gasto ---

// Hoja para cambiarle el nombre a un tipo o quitarlo. Quitar solo lo esconde: los gastos ya anotados lo conservan.
function abrirHojaTipo(tipo, tipos, alGuardar) {
  let guardando = false;
  let hoja = null;
  const nombre = campo({ etiqueta: 'Nombre', valor: tipo.nombre });
  nombre.input.addEventListener('input', () => nombre.error(''));
  nombre.input.addEventListener('keydown', (evento) => evento.key === 'Enter' && cambiarNombre());
  const botonNombre = h('button', { class: 'boton-principal', type: 'button', onclick: cambiarNombre }, icono('check'), 'Cambiar nombre');
  const botonQuitar = h('button', { class: 'boton-peligro', type: 'button', onclick: quitar }, icono('borrar'), 'Quitar');

  // Los dos cambios usan lo mismo: guardar el tipo, cerrar la hoja y avisar.
  async function terminar(cambiado, mensaje) {
    guardando = true;
    botonNombre.disabled = true;
    botonQuitar.disabled = true;
    try {
      await guardar('tiposGasto', cambiado);
    } catch (error) {
      console.error(error);
      guardando = false;
      botonNombre.disabled = false;
      botonQuitar.disabled = false;
      aviso(SIN_GUARDAR);
      return;
    }
    aviso(mensaje);
    hoja.cerrar();
    alGuardar();
  }

  async function cambiarNombre() {
    if (guardando) return;
    const texto = nombre.input.value.trim();
    const repetido = tipos.some((t) => t.activo && t.ambito === tipo.ambito && t.id !== tipo.id && claveNombre(t.nombre) === claveNombre(texto));
    if (texto === '') return nombre.error('Escribe el nombre del tipo');
    if (repetido) return nombre.error('Ese tipo ya existe');
    await terminar({ ...tipo, nombre: texto }, 'Cambios guardados');
  }

  async function quitar() {
    if (guardando) return;
    if (!(await confirmar(`¿Quitar el tipo ${tipo.nombre}? Los gastos que ya anotaste con este tipo se conservan.`, { si: 'Quitar' }))) return;
    if (guardando) return; // por si tocó Cambiar nombre mientras tenía la pregunta abierta
    await terminar({ ...tipo, activo: false }, 'Tipo quitado');
  }

  hoja = abrirHoja('Tipo de gasto', [nombre.el, h('div', { class: 'acciones' }, botonNombre, botonQuitar)]);
}

// --- Pantalla ---

export async function mostrar(el, params) {
  let datos = await cargarTodo();
  let respaldando = false;
  let restaurando = false;

  // Zonas que se vuelven a dibujar al guardar algo. Las tarjetas y el campo del valor del día se arman una sola vez,
  // así lo que la persona esté escribiendo en otro campo no se pierde.
  const zonaProductos = h('div');
  const zonaTipos = h('div');
  const zonaQuitados = h('div');
  const zonaRespaldo = h('p', { class: 'ultimo-respaldo' });

  async function recargar() {
    datos = await cargarTodo();
    dibujarProductos();
    dibujarTipos();
    dibujarQuitados();
    dibujarUltimoRespaldo();
  }
  const recargarSinFalla = () => recargar().catch((error) => console.error(error));

  // --- Valor del día ---
  const valorDia = campo({
    etiqueta: 'Cuánto se paga por día',
    tipo: 'monto',
    valor: Number.isSafeInteger(datos.ajustes.valorDia) ? aTextoEntrada(datos.ajustes.valorDia) : '',
    ayuda: 'Es para los peones al diario. Los pagos que ya hiciste no cambian.',
  });
  valorDia.el.classList.add('campo-grande');
  const ecoValorDia = agregarEco(valorDia, parseMonto, formatoDinero);
  valorDia.input.addEventListener('input', () => valorDia.error(''));
  valorDia.input.addEventListener('keydown', (evento) => evento.key === 'Enter' && guardarValorDia());
  const botonValorDia = h('button', { class: 'boton-principal', type: 'button', onclick: guardarValorDia }, icono('check'), 'Guardar');
  let guardandoValorDia = false;

  async function guardarValorDia() {
    if (guardandoValorDia) return;
    const valor = parseMonto(valorDia.input.value);
    if (valor === null || valor <= 0) {
      valorDia.error('Escribe cuánto se paga por día');
      return valorDia.input.focus();
    }
    guardandoValorDia = true;
    botonValorDia.disabled = true;
    try {
      await guardarAjustes({ valorDia: valor });
      valorDia.input.value = aTextoEntrada(valor);
      ecoValorDia();
      aviso('Valor del día guardado');
    } catch (error) {
      console.error(error);
      aviso(SIN_GUARDAR);
    } finally {
      guardandoValorDia = false;
      botonValorDia.disabled = false;
    }
  }

  // --- Productos ---
  function filaProducto(producto) {
    return h('button', { class: 'fila', type: 'button', onclick: () => abrirHojaProducto(producto, datos.productos, recargarSinFalla) },
      h('span', { class: producto.activo ? 'circulo acento' : 'circulo' }, icono('ladrillo', { tam: 26 })),
      h('span', { class: 'texto' },
        h('strong', { class: 'nombre' }, producto.nombre, producto.activo ? null : [' ', h('span', { class: 'etiqueta' }, 'Inactivo')]),
        h('span', { class: 'detalle' }, `Venta ${formatoPrecio(producto.precioVenta)}`),
        h('span', { class: 'detalle' }, `Pago al peón ${formatoPrecio(producto.pagoPeon)}`)),
      icono('editar', { tam: 22 }));
  }

  function dibujarProductos() {
    zonaProductos.replaceChildren(h('div', { class: 'ajuste-zona' },
      datos.productos.length === 0
        ? estadoVacio({ titulo: 'No hay productos', texto: 'Agrega uno para poder vender y pagar a los peones.' })
        : h('div', { class: 'lista-filas' }, datos.productos.map(filaProducto)),
      h('button', { class: 'boton-secundario', type: 'button', onclick: () => abrirHojaProducto(null, datos.productos, recargarSinFalla) },
        icono('ladrillo'), '+ Nuevo producto')));
  }

  // --- Tipos de gasto ---
  function dibujarTipos() {
    zonaTipos.replaceChildren(h('div', { class: 'ajuste-zona' },
      AMBITOS.map((ambito) => {
        const lista = datos.tiposGasto.filter((t) => t.activo && t.ambito === ambito.id);
        return h('div', {},
          h('h4', {}, icono(ambito.icono, { tam: 20 }), ambito.rotulo),
          lista.length === 0
            ? h('p', { class: 'nota' }, 'No hay tipos. Puedes crear uno en la pantalla Gasto.')
            : h('div', { class: ambito.id === 'casa' ? 'fichas casa' : 'fichas' },
                lista.map((t) => h('button', { type: 'button', onclick: () => abrirHojaTipo(t, datos.tiposGasto, recargarSinFalla) },
                  icono(iconoTipoGasto(t.nombre), { tam: 32 }), t.nombre))));
      }),
      h('p', { class: 'nota' }, 'Toca un tipo para cambiarle el nombre o quitarlo.')));
  }

  // --- Peones quitados ---
  async function reactivar(peon, boton) {
    boton.disabled = true;
    try {
      await guardar('peones', { ...peon, activo: true });
    } catch (error) {
      console.error(error);
      boton.disabled = false;
      aviso(SIN_GUARDAR);
      return;
    }
    aviso('Peón activado');
    await recargarSinFalla();
  }

  function filaQuitado(peon) {
    const boton = h('button', { class: 'boton-secundario', type: 'button', onclick: () => reactivar(peon, boton) }, icono('check'), 'Volver a activar');
    return h('div', { class: 'quitado' },
      h('div', { class: 'quitado-info' },
        h('span', { class: peon.ambito === 'casa' ? 'circulo casa' : 'circulo' }, icono('usuario', { tam: 26 })),
        h('strong', { class: 'nombre' }, peon.nombre, peon.ambito === 'casa' ? [' ', h('span', { class: 'etiqueta casa' }, 'CASA')] : null)),
      boton);
  }

  function dibujarQuitados() {
    const quitados = datos.peones.filter((p) => !p.activo);
    zonaQuitados.replaceChildren(h('div', { class: 'ajuste-zona' },
      h('h4', {}, 'Peones quitados'),
      quitados.length === 0
        ? h('p', { class: 'nota' }, 'No hay peones quitados.')
        : h('div', { class: 'lista-filas' }, quitados.map(filaQuitado)),
      h('a', { class: 'boton-secundario', href: '#/peones' }, icono('peones'), 'Ir a Peones')));
  }

  // --- Respaldo ---
  function dibujarUltimoRespaldo() {
    zonaRespaldo.replaceChildren(icono('calendario', { tam: 22 }), `Último respaldo: ${textoUltimoRespaldo(datos.ajustes.ultimoRespaldo)}`);
  }

  const botonRespaldo = h('button', { class: 'boton-principal', type: 'button', onclick: alHacerRespaldo }, icono('compartir'), 'Hacer respaldo');
  async function alHacerRespaldo() {
    if (respaldando) return;
    respaldando = true;
    botonRespaldo.disabled = true;
    let resultado;
    try {
      resultado = await hacerRespaldo();
    } catch (error) {
      respaldando = false;
      botonRespaldo.disabled = false;
      if (error?.name === 'AbortError') return; // cerró el menú de compartir: no es una falla
      console.error(error);
      aviso('No se pudo hacer el respaldo. Intenta de nuevo.');
      return;
    }
    aviso(resultado === 'compartido' ? 'Respaldo compartido' : 'Respaldo descargado');
    respaldando = false;
    botonRespaldo.disabled = false;
    await recargarSinFalla(); // ya anotó la fecha
  }

  const errorRestaurar = h('p', { class: 'error-grande', role: 'alert', hidden: true });
  const archivo = h('input', {
    type: 'file',
    accept: ARCHIVOS_RESPALDO,
    hidden: true,
    'aria-label': 'Archivo de respaldo',
    'data-restaurar': '',
    onchange: alElegirArchivo,
  });
  const botonRestaurar = h('button', { class: 'boton-secundario', type: 'button', onclick: () => archivo.click() }, icono('restaurar'), 'Restaurar respaldo');

  function errorDeRestaurar(mensaje) {
    errorRestaurar.textContent = mensaje;
    errorRestaurar.hidden = false;
    errorRestaurar.scrollIntoView({ block: 'nearest' });
  }

  // Archivo -> leer -> revisar -> confirmar -> reemplazar. Hasta que importar termina, no se toca ningún dato.
  async function alElegirArchivo() {
    const elegido = archivo.files[0];
    if (!elegido || restaurando) return;
    restaurando = true;
    botonRestaurar.disabled = true;
    errorRestaurar.hidden = true;
    try {
      let respaldo;
      try {
        respaldo = await leerRespaldo(elegido);
      } catch (error) {
        return errorDeRestaurar(error.message);
      }
      const revision = validarRespaldo(respaldo);
      if (!revision.ok) return errorDeRestaurar(revision.error);
      const pregunta = esFechaValida(respaldo.fecha)
        ? `Esto reemplaza todo lo que hay ahora con el respaldo del ${formatoFecha(respaldo.fecha)}. ¿Seguir?`
        : 'Esto reemplaza todo lo que hay ahora. ¿Seguir?';
      if (!(await confirmar(pregunta))) return;
      try {
        await importar(respaldo);
      } catch (error) {
        console.error(error);
        return errorDeRestaurar('No se pudo restaurar el respaldo. Tus datos no cambiaron.');
      }
      aviso('Respaldo restaurado');
      ir('/resumen');
    } finally {
      restaurando = false;
      botonRestaurar.disabled = false;
      archivo.value = ''; // así se puede elegir el mismo archivo otra vez
    }
  }

  dibujarProductos();
  dibujarTipos();
  dibujarQuitados();
  dibujarUltimoRespaldo();
  el.append(
    tarjeta('ajuste-valor-dia', 'calendario', 'Valor del día', valorDia.el, botonValorDia),
    tarjeta('ajuste-productos', 'ladrillo', 'Productos', zonaProductos),
    tarjeta('ajuste-tipos', 'etiqueta', 'Tipos de gasto', zonaTipos),
    tarjeta('ajuste-trabajadores', 'peones', 'Trabajadores', zonaQuitados),
    tarjeta('ajuste-respaldo', 'compartir', 'Respaldo', zonaRespaldo, botonRespaldo, botonRestaurar, archivo, errorRestaurar)
  );
}
