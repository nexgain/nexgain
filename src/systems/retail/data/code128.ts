// Code 128 barcodes (the kind on most clothing tags and shop labels), drawn as
// SVG for the printable labels. Uses Code Set B, which covers every printable
// character (letters, digits, spaces and symbols), so any barcode NexGain
// makes ("NX0123456789") or a supplier's can be printed.
//
// A Code 128 barcode is: a start code, one code per character, a check code
// (so scanners can tell a misread), and a stop code. Each code is 3 black bars
// and 3 white spaces, 11 modules wide in total (the stop code is 13).

// Bar/space widths for codes 0-106 (from the Code 128 standard).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Whether Code Set B can draw this text (printable ASCII, 1 to 64 characters). */
export function canEncode128(text: string) {
  return /^[ -~]{1,64}$/.test(text);
}

/** The codes for the text: start B, one per character, the check code, stop. */
export function code128Codes(text: string): number[] {
  if (!canEncode128(text)) throw new Error('A Code 128 barcode can only hold printable characters (up to 64).');
  const data = [...text].map((ch) => ch.charCodeAt(0) - 32);
  // Check code: the start code, plus each character's code times its position, mod 103.
  const check = data.reduce((sum, code, i) => sum + code * (i + 1), START_B) % 103;
  return [START_B, ...data, check, STOP];
}

/** The bar widths, alternating black and white, starting with black (in modules). */
export function code128Widths(text: string): number[] {
  return code128Codes(text).flatMap((code) => [...PATTERNS[code]].map(Number));
}

/**
 * The barcode as an SVG drawing: black bars on white, with a quiet zone of 10
 * modules each side (scanners need it). `height` is in the SVG's own units.
 */
export function code128Svg(text: string, { height = 60, module = 2 } = {}) {
  const widths = code128Widths(text);
  const quiet = 10;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x * module}" y="0" width="${w * module}" height="${height}"/>`);
    x += w;
  });
  const width = (x + quiet) * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}
