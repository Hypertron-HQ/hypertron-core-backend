/** Non-negative decimal string compare (integer scaled — no float). */

const DECIMAL_STRING_REGEX = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  validateNonNegativeDecimal(a, 'a');
  validateNonNegativeDecimal(b, 'b');

  const prec = Math.max(decimalPlaces(a), decimalPlaces(b));
  const scaledA = scale(a, prec);
  const scaledB = scale(b, prec);

  if (scaledA < scaledB) return -1;
  if (scaledA > scaledB) return 1;
  return 0;
}

function decimalPlaces(value: string): number {
  const idx = value.indexOf('.');
  return idx === -1 ? 0 : value.length - idx - 1;
}

function scale(value: string, precision: number): bigint {
  const [intPart, fracPart = ''] = value.split('.');
  const paddedFrac = fracPart.padEnd(precision, '0').slice(0, precision);
  return BigInt(intPart + paddedFrac);
}

function validateNonNegativeDecimal(value: string, paramName: string): void {
  if (typeof value !== 'string' || !DECIMAL_STRING_REGEX.test(value)) {
    throw new Error(
      `compareDecimalStrings: '${paramName}' must be a non-negative decimal string`,
    );
  }
}
