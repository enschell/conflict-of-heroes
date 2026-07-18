/**
 * A tiny JS-value -> TypeScript-source pretty printer, shared by every editor
 * export (`emitMissionSource.ts`, `emitMapSource.ts`). `raw(code)` escapes a
 * value out of quoting/escaping so real code (an identifier expression, e.g.
 * `UNIT_TEMPLATES['ger-rifle']!`) can be spliced in verbatim.
 */

const RAW = Symbol('raw');
interface RawCode {
  [RAW]: true;
  code: string;
}
export function raw(code: string): RawCode {
  return { [RAW]: true, code };
}
function isRaw(v: unknown): v is RawCode {
  return !!v && typeof v === 'object' && RAW in (v as object);
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

export function toSource(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (isRaw(value)) return value.code;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${padIn}${toSource(v, indent + 1)}`).join(',\n');
    return `[\n${items},\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const lines = entries
      .map(([k, v]) => `${padIn}${IDENT.test(k) ? k : quote(k)}: ${toSource(v, indent + 1)}`)
      .join(',\n');
    return `{\n${lines},\n${pad}}`;
  }
  throw new Error(`toSource: cannot serialize value of type ${typeof value}`);
}

export function slugify(title: string, fallback = 'untitled'): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return s || fallback;
}
