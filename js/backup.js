// Respaldo: revisar si un archivo es un respaldo, ponerle nombre, compartirlo o descargarlo y leerlo.
// Guardar y reemplazar los datos es trabajo de db.js (exportar / importar); aquí no se toca la base salvo
// para anotar la fecha del último respaldo.

import { STORES, APP_RESPALDO, VERSION_RESPALDO, exportar, guardarAjustes } from './db.js';

const NO_ES_RESPALDO = 'El archivo no es un respaldo de la ladrillera';
const SEGUNDOS_PARA_SOLTAR_EL_ARCHIVO = 40;

// Revisa un objeto leído de un archivo. Devuelve {ok: true} o {ok: false, error} con el motivo en español.
export function validarRespaldo(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: NO_ES_RESPALDO };
  if (obj.app !== APP_RESPALDO) return { ok: false, error: NO_ES_RESPALDO };
  if (obj.version !== VERSION_RESPALDO) {
    return {
      ok: false,
      error: `Este respaldo es de otra versión (${obj.version}) y esta app solo entiende la versión ${VERSION_RESPALDO}`,
    };
  }
  if (obj.datos === null || typeof obj.datos !== 'object' || Array.isArray(obj.datos)) {
    return { ok: false, error: NO_ES_RESPALDO };
  }
  for (const store of STORES) {
    if (!Array.isArray(obj.datos[store])) {
      return { ok: false, error: `Al respaldo le falta la lista "${store}"` };
    }
  }
  return { ok: true };
}

// El respaldo es JSON, pero se guarda como archivo de texto (.txt, text/plain): Chrome en Android solo deja
// compartir archivos de tipos conocidos y no incluye .json, así que con .json nunca se abriría el menú de compartir.
export function nombreArchivo(fecha) {
  return `ladrillera-respaldo-${fecha}.txt`;
}

// Descarga el archivo con un enlace invisible (para teléfonos que no pueden compartir archivos).
function descargar(archivo) {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo.name;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), SEGUNDOS_PARA_SOLTAR_EL_ARCHIVO * 1000);
}

// Arma el archivo de respaldo y lo comparte (menú de Android) o, si no se puede, lo descarga.
// Anota la fecha del último respaldo solo cuando el archivo salió. Si la persona cierra el menú de compartir,
// se vuelve a lanzar ese error (name === 'AbortError') y no se anota nada.
export async function hacerRespaldo() {
  const ahora = Date.now();
  const respaldo = await exportar();
  // El archivo ya lleva anotado este respaldo, así que al restaurarlo no se pide otro enseguida.
  for (const ajustes of respaldo.datos.ajustes) ajustes.ultimoRespaldo = ahora;
  const archivo = new File([JSON.stringify(respaldo)], nombreArchivo(respaldo.fecha), { type: 'text/plain' });

  let resultado = null;
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Respaldo de la ladrillera' });
      resultado = 'compartido';
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Cualquier otro fallo al compartir: se descarga para que el respaldo no se pierda.
    }
  }
  if (resultado === null) {
    descargar(archivo);
    resultado = 'descargado';
  }
  await guardarAjustes({ ultimoRespaldo: ahora });
  return resultado;
}

// Lee un archivo elegido por la persona (cualquier nombre o tipo, .txt o .json) y devuelve su contenido como objeto.
// Solo falla si el texto no es JSON; que sea un respaldo de verdad lo dice validarRespaldo.
export async function leerRespaldo(file) {
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    throw new Error(NO_ES_RESPALDO);
  }
}
