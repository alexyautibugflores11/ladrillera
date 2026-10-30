// Almacenamiento local (IndexedDB). Solo guarda y lee: no dibuja pantallas ni decide reglas del negocio.
// Importar este módulo no toca indexedDB; la base se abre con abrir().
// Toda la app lee con cargarTodo() y escribe con guardar(), borrar() o aplicar().

import { hoy } from './fechas.js';

export const STORES = ['productos', 'peones', 'adelantos', 'pagos', 'ventas', 'tiposGasto', 'gastos', 'ajustes'];

export const APP_RESPALDO = 'ladrillera';
export const VERSION_RESPALDO = 1;

const NOMBRE_BASE = 'ladrillera';
const VERSION_BASE = 1;

const AJUSTES_INICIALES = { id: 'ajustes', valorDia: 250000, ultimoRespaldo: null };
const PRODUCTO_INICIAL = { nombre: 'Ladrillo', precioVenta: 2300, pagoPeon: 400, stockInicial: 0, activo: true };
const TIPOS_INICIALES = [
  ['negocio', 'Aserrín'], ['negocio', 'Leña'], ['negocio', 'Arena'], ['negocio', 'Tierra'],
  ['casa', 'Luz'], ['casa', 'Comida'], ['casa', 'Agua'],
];

let conexion = null; // la única conexión abierta; abrir() la reemplaza

export function nuevoId() {
  return crypto.randomUUID();
}

// --- Ayudas para IndexedDB (sus pedidos usan eventos; aquí se vuelven promesas) ---

function conexionAbierta() {
  if (!conexion) throw new Error('La base de datos no está abierta');
  return conexion;
}

function cerrar() {
  if (conexion) {
    conexion.close();
    conexion = null;
  }
}

// Espera un pedido suelto (abrir o borrar una base) y entrega su resultado.
function esperar(pedido) {
  return new Promise((resolver, rechazar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

// Corre `trabajo` dentro de UNA transacción sobre las colecciones dadas y espera a que termine.
// `trabajo(tienda)` debe lanzar todos sus pedidos de forma síncrona (o desde los onsuccess de otros
// pedidos de la misma transacción): si espera una promesa de por medio, la transacción se cierra sola.
// Si algo falla (un pedido o una excepción de `trabajo`), se cancela la transacción completa.
function transaccion(nombres, modo, trabajo) {
  return new Promise((resolver, rechazar) => {
    const tx = conexionAbierta().transaction(nombres, modo);
    tx.oncomplete = () => resolver();
    tx.onabort = () => rechazar(tx.error ?? new Error('No se pudo completar la operación'));
    try {
      trabajo((nombre) => tx.objectStore(nombre));
    } catch (error) {
      try {
        tx.abort();
      } catch (yaTermino) {
        // la transacción ya había terminado
      }
      rechazar(error);
    }
  });
}

// --- Abrir y borrar la base ---

export async function abrir(nombre = NOMBRE_BASE) {
  cerrar();
  const pedido = indexedDB.open(nombre, VERSION_BASE);
  pedido.onupgradeneeded = () => {
    const base = pedido.result;
    for (const store of STORES) {
      if (!base.objectStoreNames.contains(store)) base.createObjectStore(store, { keyPath: 'id' });
    }
  };
  const base = await esperar(pedido);
  // Si otra pestaña pide borrar o actualizar la base, esta conexión se cierra para no bloquearla.
  base.onversionchange = () => {
    base.close();
    if (conexion === base) conexion = null;
  };
  conexion = base;
}

export async function borrarBase(nombre) {
  cerrar();
  await esperar(indexedDB.deleteDatabase(nombre));
}

// --- Leer ---

// Lista de cada colección, por orden de creación (a igual `creado`, el orden de la llave).
async function leerListas() {
  const pedidos = {};
  await transaccion(STORES, 'readonly', (tienda) => {
    for (const store of STORES) pedidos[store] = tienda(store).getAll();
  });
  const listas = {};
  for (const store of STORES) {
    listas[store] = pedidos[store].result.sort((a, b) => (Number(a.creado) || 0) - (Number(b.creado) || 0));
  }
  return listas;
}

// Las siete colecciones como listas y `ajustes` como el registro único (con sus valores iniciales si aún no existe).
export async function cargarTodo() {
  const { ajustes, ...listas } = await leerListas();
  return { ...listas, ajustes: ajustes[0] ?? { ...AJUSTES_INICIALES } };
}

// --- Escribir ---

// Pone `id` y `creado` solo si faltan. Modifica y devuelve el mismo objeto.
function completar(registro) {
  registro.id ??= nuevoId();
  registro.creado ??= Date.now();
  return registro;
}

// Aplica todos los cambios en una sola transacción: o se hacen todos o no se hace ninguno.
// Cada cambio es {store, guardar: obj} o {store, borrar: id}.
export async function aplicar(cambios) {
  if (cambios.length === 0) return;
  const nombres = [...new Set(cambios.map((cambio) => cambio.store))];
  await transaccion(nombres, 'readwrite', (tienda) => {
    for (const cambio of cambios) {
      if ('borrar' in cambio) tienda(cambio.store).delete(cambio.borrar);
      else tienda(cambio.store).put(completar(cambio.guardar));
    }
  });
}

export async function guardar(store, obj) {
  await aplicar([{ store, guardar: obj }]);
  return obj;
}

export async function borrar(store, id) {
  await aplicar([{ store, borrar: id }]);
}

// Cambia solo los campos dados del registro de ajustes.
export function guardarAjustes(parcial) {
  return transaccion(['ajustes'], 'readwrite', (tienda) => {
    const ajustes = tienda('ajustes');
    const actual = ajustes.get('ajustes');
    actual.onsuccess = () => {
      ajustes.put({ ...AJUSTES_INICIALES, ...actual.result, ...parcial, id: 'ajustes' });
    };
  });
}

// --- Datos iniciales ---

// Solo la primera vez (cuando aún no hay registro de ajustes). Lo que el dueño borre después no vuelve.
// Si por alguna razón ya hay productos o tipos de gasto, no se duplican.
export function sembrarSiVacio() {
  return transaccion(['productos', 'tiposGasto', 'ajustes'], 'readwrite', (tienda) => {
    const ajustes = tienda('ajustes');
    const productos = tienda('productos');
    const tipos = tienda('tiposGasto');
    const ahora = Date.now();
    const marca = ajustes.get('ajustes');
    marca.onsuccess = () => {
      if (marca.result) return;
      ajustes.add(AJUSTES_INICIALES);
      const hayProductos = productos.count();
      hayProductos.onsuccess = () => {
        if (hayProductos.result === 0) productos.add(completar({ ...PRODUCTO_INICIAL, creado: ahora }));
      };
      const hayTipos = tipos.count();
      hayTipos.onsuccess = () => {
        if (hayTipos.result > 0) return;
        TIPOS_INICIALES.forEach(([ambito, nombre], i) => {
          // `creado` distinto en cada uno para que se muestren en este mismo orden.
          tipos.add(completar({ nombre, ambito, activo: true, creado: ahora + i }));
        });
      };
    };
  });
}

// --- Respaldo: exportar e importar ---

export async function exportar() {
  return { app: APP_RESPALDO, version: VERSION_RESPALDO, fecha: hoy(), datos: await leerListas() };
}

// Reemplaza todo por el contenido del respaldo, en una sola transacción: si algo falla, los datos actuales quedan como estaban.
// No valida el respaldo (para eso está validarRespaldo): pero una colección que falta se rechaza, no se toma por vacía.
export function importar(respaldo) {
  return transaccion(STORES, 'readwrite', (tienda) => {
    for (const store of STORES) {
      const coleccion = tienda(store);
      coleccion.clear();
      for (const registro of respaldo.datos[store]) coleccion.put(registro);
    }
  });
}
