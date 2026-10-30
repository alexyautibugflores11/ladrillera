// Fechas = texto "AAAA-MM-DD" en hora LOCAL. La semana va de lunes a domingo.
// Nunca se le pasa el texto de la fecha al constructor de Date ni se convierte a ISO: ambos
// trabajan en UTC y en Ecuador (UTC-5) corren el día. Este módulo no toca la pantalla ni la base de datos.

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DESDE_SIEMPRE = '0000-01-01';
const HASTA_SIEMPRE = '9999-12-31';

const dos = (n) => String(n).padStart(2, '0');

// "AAAA-MM-DD" de un Date, con los datos locales (no UTC).
function aTexto(fecha) {
  return String(fecha.getFullYear()).padStart(4, '0') + '-' + dos(fecha.getMonth() + 1) + '-' + dos(fecha.getDate());
}

// Fecha de hoy. Sin argumento usa globalThis.FECHA_PRUEBA si existe (solo para probar la app a mano).
export function hoy(ahora) {
  if (ahora === undefined && globalThis.FECHA_PRUEBA) return globalThis.FECHA_PRUEBA;
  return aTexto(ahora ?? new Date());
}

// Date a medianoche local de un "AAAA-MM-DD".
export function aDate(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d);
}

// Suma (o resta, con n negativo) días de calendario; cruza meses y años.
export function sumarDias(fecha, n) {
  const [a, m, d] = fecha.split('-').map(Number);
  return aTexto(new Date(a, m - 1, d + n));
}

// Lunes de la semana de esa fecha (el domingo pertenece a la semana que empezó el lunes anterior).
export function inicioSemana(fecha) {
  const desdeLunes = (aDate(fecha).getDay() + 6) % 7; // lunes = 0 ... domingo = 6
  return sumarDias(fecha, -desdeLunes);
}

// Domingo de la semana de esa fecha.
export function finSemana(fecha) {
  return sumarDias(inicioSemana(fecha), 6);
}

// { desde, hasta } (ambos incluidos) de 'semana', 'mes' o 'todo' alrededor de esa fecha.
export function rangoPeriodo(periodo, fecha) {
  if (periodo === 'semana') return { desde: inicioSemana(fecha), hasta: finSemana(fecha) };
  if (periodo === 'mes') {
    const [a, m] = fecha.split('-').map(Number);
    const ultimoDia = new Date(a, m, 0).getDate(); // el día 0 del mes siguiente es el último de este
    return { desde: fecha.slice(0, 7) + '-01', hasta: fecha.slice(0, 7) + '-' + dos(ultimoDia) };
  }
  if (periodo === 'todo') return { desde: DESDE_SIEMPRE, hasta: HASTA_SIEMPRE };
  throw new Error('Periodo desconocido: ' + periodo);
}

// ¿La fecha cae dentro del rango, con los dos extremos incluidos? (el texto AAAA-MM-DD se ordena bien)
export function enRango(fecha, rango) {
  return fecha >= rango.desde && fecha <= rango.hasta;
}

export function esSabado(fecha) {
  return aDate(fecha).getDay() === 6;
}

// "sáb 31/10/26"
export function formatoFecha(fecha) {
  const [a, m, d] = fecha.split('-');
  return DIAS_CORTOS[aDate(fecha).getDay()] + ' ' + d + '/' + m + '/' + a.slice(-2);
}

// ¿Es una fecha real de calendario con forma "AAAA-MM-DD" (año de 4 cifras)? Rechaza '', '2026-13-45' y '2026-02-30'.
// Date toma los años 0 a 99 como 1900 a 1999, así que esos años (que nadie usa) también se rechazan.
export function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const real = new Date(a, m - 1, d);
  return real.getFullYear() === a && real.getMonth() === m - 1 && real.getDate() === d;
}
