/**
 * One CSV cell.
 *
 * A leading =, +, - or @ makes spreadsheets treat the text as a formula, so a
 * value that starts with one is prefixed with a quote. Exports carry customer
 * and campaign text that this app does not control.
 */
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
