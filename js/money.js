// Dinero = enteros en diezmilésimas de dólar: $0,23 = 2300, $0,015 = 150, $25 = 250000.
// Nunca se guardan decimales. Este módulo no toca la pantalla ni la base de datos.

export const ESCALA = 10000;
const DECIMALES = 4; // cifras decimales de ESCALA
const CENTAVO = ESCALA / 100;

// "123" o "1.234.567" (el mismo separador, grupos de 3 salvo el primero, de 1 a 3 cifras).
function agrupadoBien(texto, separador) {
  return texto
    .split(separador)
    .every((grupo, i) => (i === 0 ? /^\d{1,3}$/ : /^\d{3}$/).test(grupo));
}

function agruparMiles(enteros) {
  return String(enteros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Signo, parte entera en dólares y las 4 cifras decimales (texto) de un monto en unidades.
function descomponer(unidades) {
  const magnitud = Math.abs(unidades);
  const resto = magnitud % ESCALA;
  return {
    signo: unidades < 0 ? '-' : '',
    enteros: (magnitud - resto) / ESCALA,
    decimales: String(resto).padStart(DECIMALES, '0'),
  };
}

// Convierte lo que escribe la persona ("0,23", "0.23", "$ 25", "1.234,56", "1,234.56", "1.500")
// a unidades. Devuelve null si no es un monto válido (vacío, letras, negativo, más de 4 decimales).
export function parseMonto(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.replace(/[$\s]/g, '');
  if (!/^[\d.,]+$/.test(limpio)) return null;

  const punto = limpio.lastIndexOf('.');
  const coma = limpio.lastIndexOf(',');
  let enteros;
  let decimales = '';

  if (punto >= 0 && coma >= 0) {
    // Aparecen los dos: el último en aparecer es el decimal y el otro separa miles.
    const decimal = punto > coma ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    const partes = limpio.split(decimal);
    if (partes.length !== 2 || !agrupadoBien(partes[0], miles)) return null;
    enteros = partes[0].split(miles).join('');
    decimales = partes[1];
  } else if (punto >= 0 || coma >= 0) {
    // Un solo tipo: varias veces es de miles. Una sola vez es decimal, salvo que detrás haya
    // exactamente 3 cifras y delante algo que no sea vacío ni "0": "1.500" son 1.500 dólares,
    // pero "0,015" y "1,5" son decimales.
    const separador = punto >= 0 ? '.' : ',';
    const partes = limpio.split(separador);
    const [antes, despues] = partes;
    const esMiles = partes.length > 2 || (despues.length === 3 && antes !== '' && antes !== '0');
    if (esMiles) {
      if (!agrupadoBien(limpio, separador)) return null;
      enteros = partes.join('');
    } else {
      [enteros, decimales] = partes;
    }
  } else {
    enteros = limpio;
  }

  if (enteros === '' && decimales === '') return null;
  if (decimales.length > DECIMALES) return null;
  const unidades = Number(enteros + decimales.padEnd(DECIMALES, '0'));
  return Number.isSafeInteger(unidades) ? unidades : null;
}

// Cantidad entera de ladrillos: "7500", "7.500", "7,500" o "7 500". Todo lo demás es null.
export function parseCantidad(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  if (!/^\d+$/.test(t) && !/^\d{1,3}([.,\s])\d{3}(\1\d{3})*$/.test(t)) return null;
  const cantidad = Number(t.replace(/\D/g, ''));
  return Number.isSafeInteger(cantidad) ? cantidad : null;
}

// Redondea al centavo más cercano; la mitad sube (en valor absoluto, así -x se redondea como x).
export function redondearCentavo(unidades) {
  const magnitud = Math.abs(unidades);
  const resto = magnitud % CENTAVO;
  const redondeado = magnitud - resto + (resto >= CENTAVO / 2 ? CENTAVO : 0);
  return unidades < 0 ? -redondeado || 0 : redondeado;
}

// "$1.234,56": redondea al centavo antes de formatear.
export function formatoDinero(unidades) {
  const { signo, enteros, decimales } = descomponer(redondearCentavo(unidades));
  return signo + '$' + agruparMiles(enteros) + ',' + decimales.slice(0, 2);
}

// Precio por unidad con 2 a 4 decimales: "$0,23", "$0,015", "$25,00".
export function formatoPrecio(unidades) {
  const { signo, enteros, decimales } = descomponer(unidades);
  return signo + '$' + agruparMiles(enteros) + ',' + decimales.replace(/0+$/, '').padEnd(2, '0');
}

// "7.500"
export function formatoCantidad(cantidad) {
  return (cantidad < 0 ? '-' : '') + agruparMiles(Math.abs(cantidad));
}

// Texto para precargar un campo de monto: sin "$" ni miles, coma decimal, sin ceros sobrantes.
export function aTextoEntrada(unidades) {
  const { signo, enteros, decimales } = descomponer(unidades);
  let sinCeros = decimales.replace(/0+$/, '');
  // Con parte entera distinta de 0, exactamente 3 decimales ("1,125") parseMonto los leería
  // como miles; con 4 cifras ("1,1250") vuelve a ser decimal y el texto va y vuelve sin cambio.
  if (enteros !== 0 && sinCeros.length === 3) sinCeros = decimales;
  return signo + enteros + (sinCeros ? ',' + sinCeros : '');
}
