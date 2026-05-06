// Parser för marknadsplaner producerade av Claude.
//
// Formatet är inställt så det är (a) enkelt för Claude att producera, (b) entydigt
// att parsa, och (c) läsbart för människor i textform innan import:
//
//   KAMPANJ: <namn>           (valfritt — om angivet taggas alla aktiviteter med det)
//
//   YYYY-MM-DD | <kanal> | <titel>
//     <body-text indenterad med 2 mellanslag, kan vara flera rader>
//
//   YYYY-MM-DD | <kanal> | <titel>
//     <body...>
//
// Kanal är ett av: linkedin, meta_fb, meta_ig, twitter, mailerlite, blog, press, event, other
// Typ härleds från kanal (linkedin → social_post, mailerlite → email_campaign, etc.)

import type { ActivityType } from './activities';

export interface ParsedActivity {
  scheduled_for: string;
  channel: string;
  type: ActivityType;
  title: string;
  body: string;
  warnings: string[];
}

export interface ParsedPlan {
  campaign: string | null;
  activities: ParsedActivity[];
  errors: string[];
}

const KNOWN_CHANNELS = new Set([
  'linkedin',
  'meta_fb',
  'meta_ig',
  'twitter',
  'mailerlite',
  'blog',
  'press',
  'event',
  'other',
]);

const SOCIAL_CHANNELS = new Set(['linkedin', 'meta_fb', 'meta_ig', 'twitter']);

export function deriveType(channel: string): ActivityType {
  const c = channel.toLowerCase();
  if (SOCIAL_CHANNELS.has(c)) return 'social_post';
  if (c === 'mailerlite') return 'email_campaign';
  if (c === 'press') return 'pr';
  if (c === 'event') return 'event';
  if (c === 'blog') return 'other'; // blog = content, sparas som other tills vi har content_items-koppling
  return 'other';
}

export function parsePlan(text: string): ParsedPlan {
  const lines = text.split('\n');
  let campaign: string | null = null;
  const activities: ParsedActivity[] = [];
  const errors: string[] = [];
  let current: ParsedActivity | null = null;

  function flush() {
    if (current) {
      current.body = current.body.trim();
      activities.push(current);
      current = null;
    }
  }

  lines.forEach((rawLine, idx) => {
    // KAMPANJ-rad
    const campMatch = rawLine.match(/^\s*KAMPANJ\s*:\s*(.+)$/i);
    if (campMatch) {
      campaign = campMatch[1].trim();
      return;
    }

    // Aktivitets-rad: DATUM | KANAL | TITEL
    const actMatch = rawLine.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
    if (actMatch) {
      flush();
      const channel = actMatch[2].trim().toLowerCase();
      const warnings: string[] = [];
      if (!KNOWN_CHANNELS.has(channel)) {
        warnings.push(`Okänd kanal "${channel}" — sätts som "other"`);
      }
      current = {
        scheduled_for: actMatch[1],
        channel: KNOWN_CHANNELS.has(channel) ? channel : 'other',
        type: deriveType(channel),
        title: actMatch[3].trim(),
        body: '',
        warnings,
      };
      return;
    }

    // Body-rad — om det finns en current
    if (current && rawLine.trim().length > 0) {
      // Strippa 2-spaces indent eller > prefix
      const bodyLine = rawLine.replace(/^\s{2}/, '').replace(/^>\s?/, '');
      if (current.body) current.body += '\n' + bodyLine;
      else current.body = bodyLine;
      return;
    }

    // Tom rad — ignoreras (separator mellan aktiviteter, body får inkludera tomrader om indenterade)
    if (current && rawLine.trim().length === 0) {
      // Behåll tomrader inom body ifall nästa rad är indenterad
      if (current.body) current.body += '\n';
    }

    // Rader vi inte förstår — om de är pipe-rader utan datum, flagga
    if (rawLine.includes('|') && !actMatch && rawLine.trim().length > 0 && !rawLine.match(/^\s/)) {
      errors.push(
        `Rad ${idx + 1}: pipe-rad ("${rawLine.trim().slice(0, 60)}") matchar inte formatet "YYYY-MM-DD | kanal | titel".`,
      );
    }
  });

  flush();

  if (activities.length === 0 && errors.length === 0) {
    errors.push(
      'Hittade inga aktiviteter. Formatet ska vara: rader med "YYYY-MM-DD | kanal | titel", separerade av tom rad.',
    );
  }

  return { campaign, activities, errors };
}

/**
 * Prompt-text att kopiera till Claude. När marknadsteamet pratar med Claude om
 * en plan, paste:as detta först → Claude producerar output i exakt det format
 * dashboarden parsar.
 */
export const CLAUDE_PLAN_PROMPT = `Producera en marknadsplan i exakt detta format så jag kan paste:a den i GMF Marketing Dashboard:

KAMPANJ: <kort kampanjnamn>

YYYY-MM-DD | <kanal> | <kort titel>
  <copy/body-text indenterad med 2 mellanslag, kan vara flera rader>

YYYY-MM-DD | <kanal> | <kort titel>
  <copy/body>

Regler:
- Kanal är ett av: linkedin, meta_fb, meta_ig, twitter, mailerlite, blog, press, event, other
- Datum är YYYY-MM-DD (t.ex. 2026-05-19)
- Tom rad mellan aktiviteter
- Body är 2-spaces-indenterad eller börjar med "> "
- KAMPANJ-raden är valfri, gäller hela planen om den finns

Inga extra rubriker, kommentarer eller markdown — bara KAMPANJ-raden plus aktivitets-block.`;
