export function formatIDR(amount: number | undefined | null): string {
  const val = Number.isFinite(amount) ? Number(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(val));
}

export function formatNumberID(val: number | undefined | null): string {
  const num = Number.isFinite(val) ? Number(val) : 0;
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 1,
  }).format(num);
}

export function formatDateTimeID(isoStr: string, timezone = 'Asia/Makassar'): string {
  if (!isoStr) return '-';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return isoStr;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

export function formatDateOnlyID(isoStr: string, timezone = 'Asia/Makassar'): string {
  if (!isoStr) return '-';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return isoStr;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeZone: timezone,
  }).format(date);
}

export function generateSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'id';
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}_${rand}`.slice(0, 128);
}

export function clampStr(val: string | undefined | null, maxLen: number): string {
  if (!val) return '';
  return val.trim().slice(0, maxLen);
}

export function sanitizeCsvCell(cell: string | number): string {
  let str = String(cell ?? '');
  if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(headers: string[], rows: Array<Array<string | number>>): string {
  return (
    '\uFEFF' +
    [headers.map(sanitizeCsvCell).join(','), ...rows.map((r) => r.map(sanitizeCsvCell).join(','))].join('\n')
  );
}

export function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const csvContent = buildCsvContent(headers, rows);

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getMakassarDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function getMakassarHour(isoStr: string): number {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return 12;
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(d);
  const parsed = parseInt(hourStr, 10);
  if (Number.isNaN(parsed)) return 0;
  return parsed === 24 ? 0 : parsed;
}

export function toIsoTimestamp(val: unknown): string {
  if (!val) return new Date(0).toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? new Date(0).toISOString() : val.toISOString();
  if (typeof val === 'object' && val !== null) {
    const ts = val as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toISOString();
    }
    if (typeof ts.toMillis === 'function') {
      return new Date(ts.toMillis()).toISOString();
    }
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toISOString();
    }
  }
  return new Date(0).toISOString();
}
