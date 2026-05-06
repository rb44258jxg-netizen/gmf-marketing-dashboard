// Parser för bulk-import av leads. Stöder paste från Excel/Google Sheets
// (tab-separerat) eller CSV (kommaseparerat) med flexibla header-namn.
//
// Igenkänner kolumner med olika stavningar:
//   email      ← "email", "e-post", "epost", "mail", "e-mail", "epost-adress", ...
//   full_name  ← "namn", "name", "fullt namn", "full name"
//   phone      ← "telefon", "phone", "tel", "mobil", "mobile"
//   registered_at ← "registrerad", "registered", "datum", "regdatum"
//   external_id ← "id", "external_id", "extern id", "user_id"
//
// Om header-rad saknas: gissar att första kolumnen som matchar e-post-regex
// är e-post.

import type { AudienceKind } from './audience';

export interface ParsedLead {
  email: string;
  full_name: string | null;
  phone: string | null;
  registered_at: string | null;
  external_id: string | null;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedLead[];
  errors: string[];
  warnings: string[];
}

const HEADER_ALIASES: Record<keyof ParsedLead, string[]> = {
  email: [
    'email',
    'e-post',
    'epost',
    'mail',
    'e-mail',
    'epost-adress',
    'email_address',
    'emailaddress',
    'mejl',
    'mejladress',
  ],
  full_name: ['namn', 'name', 'fullt namn', 'full name', 'full_name', 'fullname', 'kontakt', 'kontaktperson'],
  phone: ['telefon', 'phone', 'tel', 'mobil', 'mobile', 'telefonnummer', 'phone_number'],
  registered_at: ['registrerad', 'registered', 'registered_at', 'datum', 'regdatum', 'reggad', 'created_at', 'reg_datum'],
  external_id: ['id', 'external_id', 'extern_id', 'extern id', 'user_id', 'userid', 'investerare_id', 'invid'],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export function parseLeadsCsv(text: string): ParseResult {
  const result: ParseResult = { headers: [], rows: [], errors: [], warnings: [] };
  const trimmed = text.trim();
  if (!trimmed) {
    result.errors.push('Inget innehåll att parsa.');
    return result;
  }

  const lines = trimmed.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length < 1) {
    result.errors.push('Inga rader hittade.');
    return result;
  }

  // Detektera separator: tab vinner om den finns någonstans, annars komma
  const hasTab = lines.some((l) => l.includes('\t'));
  const sep = hasTab ? '\t' : ',';

  // Parsa alla rader
  const allRows = lines.map((l) => splitDelimited(l, sep));

  // Avgör om första raden är headers eller data:
  // Om första raden inte innehåller en e-post-strängen — antag headers.
  const firstRowHasEmail = allRows[0].some((c) => EMAIL_RE.test(c.trim()));
  let headerMap: Record<keyof ParsedLead, number | -1> = {
    email: -1,
    full_name: -1,
    phone: -1,
    registered_at: -1,
    external_id: -1,
  };
  let dataStart = 0;

  if (firstRowHasEmail) {
    // Ingen header — gissa email-kolumn via regex
    result.warnings.push('Ingen header-rad detekterad — gissar e-post-kolumn via regex.');
    const emailIdx = allRows[0].findIndex((c) => EMAIL_RE.test(c.trim()));
    headerMap.email = emailIdx;
    result.headers = allRows[0].map((_, i) => `kolumn ${i + 1}`);
  } else {
    result.headers = allRows[0];
    headerMap = mapHeaders(allRows[0]);
    dataStart = 1;
    if (headerMap.email === -1) {
      result.errors.push(
        `Hittade ingen e-post-kolumn. Header-rad: ${allRows[0].join(' | ')}. Förväntade någon av: ${HEADER_ALIASES.email.join(', ')}.`,
      );
      return result;
    }
  }

  // Extrahera leads
  for (let i = dataStart; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.length === 0 || row.every((c) => c.trim() === '')) continue;

    const email = pick(row, headerMap.email)?.trim().toLowerCase() ?? '';
    if (!email) {
      result.warnings.push(`Rad ${i + 1}: tom e-post — hoppas över.`);
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      result.warnings.push(`Rad ${i + 1}: "${email}" ser inte ut som en giltig e-post — hoppas över.`);
      continue;
    }

    const lead: ParsedLead = {
      email,
      full_name: pick(row, headerMap.full_name)?.trim() || null,
      phone: pick(row, headerMap.phone)?.trim() || null,
      registered_at: parseDate(pick(row, headerMap.registered_at)),
      external_id: pick(row, headerMap.external_id)?.trim() || null,
    };
    result.rows.push(lead);
  }

  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push('Inga giltiga rader hittade.');
  }

  return result;
}

function mapHeaders(headerRow: string[]): Record<keyof ParsedLead, number | -1> {
  const map: Record<keyof ParsedLead, number | -1> = {
    email: -1,
    full_name: -1,
    phone: -1,
    registered_at: -1,
    external_id: -1,
  };
  headerRow.forEach((raw, i) => {
    const norm = normalizeHeader(raw);
    for (const key of Object.keys(HEADER_ALIASES) as Array<keyof ParsedLead>) {
      if (map[key] !== -1) continue;
      if (HEADER_ALIASES[key].some((a) => normalizeHeader(a) === norm)) {
        map[key] = i;
        break;
      }
    }
  });
  return map;
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_\-]+/g, '');
}

function pick(row: string[], idx: number | -1): string | null {
  if (idx < 0 || idx >= row.length) return null;
  return row[idx];
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // ISO?
  if (ISO_DATE_RE.test(trimmed)) {
    return new Date(trimmed.slice(0, 10) + 'T00:00:00').toISOString();
  }
  // Försök Date-parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

/**
 * Splitter som hanterar quoted CSV-fält ("foo, bar" → ['foo, bar']).
 * Hanterar också "" som escape för tecken " inom kvoter.
 */
function splitDelimited(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === sep) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Exempeldata att visa i placeholder och som "Använd exempel"-knapp.
 */
export function exampleCsv(kind: AudienceKind): string {
  if (kind === 'project_owner') {
    return `email,namn,telefon,registrerad,id
kontakt@bolagx.se,Anna Svensson,+46701234567,2026-05-01,12345
hej@startup.io,Per Persson,+46707654321,2026-05-03,12346`;
  }
  return `email,namn,telefon,registrerad,id
karin@example.com,Karin Karlsson,+46701112233,2026-05-01,98765
per@example.com,Per Persson,+46702223344,2026-05-02,98766
oscar@example.com,Oscar Olsson,+46703334455,2026-05-03,98767`;
}
