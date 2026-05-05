// /api/case-extract — Extraherar bolagsfakta från uppladdat pitch deck.
// Strategi: parsa PDF till text på servern (pdf-parse), skicka texten till
// Anthropic. Detta undviker Anthropic's PDF-page-limit och är mycket snabbare.

import { createClient } from '@supabase/supabase-js';
// pdf-parse@1.x:s index.js läser en testfil vid import — kraschar i serverless.
// Importera direkt från lib/ för att hoppa över test-bootstrappen.
// @ts-expect-error pdf-parse saknar typer i sitt npm-paket
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export const maxDuration = 60;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 60000; // ~15k tokens — säker marginal under context-fönstret

interface RequestBody {
  case_id: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anthropicKey || !supabaseUrl || !serviceKey) {
    return json({ error: 'config saknas' }, 503);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!body.case_id) return json({ error: 'case_id required' }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const [{ data: caseRow }, { data: docs }] = await Promise.all([
    supabase.from('cases').select('*').eq('id', body.case_id).single(),
    supabase.from('case_documents').select('*').eq('case_id', body.case_id),
  ]);

  if (!caseRow) return json({ error: 'case not found' }, 404);

  const pdfDocs = (docs ?? []).filter((d: { file_type: string }) =>
    (d.file_type ?? '').includes('pdf'),
  );
  if (pdfDocs.length === 0) {
    return json({ error: 'inga PDF-dokument uppladdade än för detta case' }, 400);
  }

  // Plocka text ur ALLA PDF-dokument (sammanlagd kunskapskälla)
  const docTexts: Array<{ name: string; text: string; pages: number }> = [];
  for (const doc of pdfDocs as Array<{ file_path: string; file_name: string }>) {
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('case-documents')
      .download(doc.file_path);
    if (dlErr || !fileData) continue;
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const parsed = await pdfParse(buffer);
      docTexts.push({
        name: doc.file_name,
        text: parsed.text || '',
        pages: parsed.numpages || 0,
      });
    } catch (e) {
      // Hoppa över PDF som inte kan parsas, fortsätt med övriga
      // eslint-disable-next-line no-console
      console.error('pdf-parse failed for', doc.file_name, e);
    }
  }

  if (docTexts.length === 0) {
    return json({ error: 'kunde inte läsa något PDF-dokument (skadad/krypterad fil?)' }, 422);
  }

  // Bygg sammanfogad text — trunkera vid MAX_TEXT_CHARS för säkerhets skull
  let combined = docTexts
    .map((d) => `=== ${d.name} (${d.pages} sidor) ===\n${d.text}`)
    .join('\n\n---\n\n');

  let truncated = false;
  if (combined.length > MAX_TEXT_CHARS) {
    combined = combined.slice(0, MAX_TEXT_CHARS) + '\n\n[...trunkerat — texten var längre]';
    truncated = true;
  }

  const systemPrompt = `Du extraherar bolagsfakta från ett pitch deck för marknadsförings-syfte.

Returnera ENDAST giltig JSON i ett \`\`\`json kodblock. Inga ord utanför kodblocket.

Format:
\`\`\`json
{
  "bolagsbeskrivning": "1-2 meningar — vad bolaget gör",
  "problem": "Vilket problem löser de?",
  "lösning": "Hur löser de det?",
  "team": [
    { "namn": "Förnamn Efternamn", "roll": "VD", "bakgrund": "kort" }
  ],
  "marknad": {
    "storlek": "T.ex. 50 BSEK i Norden",
    "tillväxt": "T.ex. 15% CAGR",
    "kunder": "Vilka är kunderna?"
  },
  "traction": [
    "Konkret resultat eller milstolpe (siffror!)"
  ],
  "financials": {
    "intäkter_idag": "T.ex. 2 MSEK ARR",
    "prognos": "T.ex. 25 MSEK 2027",
    "användning_av_kapital": "Vad ska pengarna gå till?"
  },
  "exit_strategi": "T.ex. förvärv av branschledare 2028-2029",
  "usp": "1 mening — varför vinner detta?",
  "risker": ["Risk 1", "Risk 2"]
}
\`\`\`

Om någon information saknas i decket — sätt fältet till null. Hitta inte på.
Skriv på svenska. Var konkret med siffror. Lyft fram det som är säljande för en investerare.`;

  const userPrompt = `Extrahera bolagsfakta från följande pitch deck för "${caseRow.name}" (${caseRow.sector}).

${caseRow.description ? `Existerande beskrivning: ${caseRow.description}\n\n` : ''}**Pitch deck text:**

${combined}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    clearTimeout(timer);

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return json({ error: 'anthropic failed', status: aiRes.status, detail: detail.slice(0, 500) }, 502);
    }

    const aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (aiData.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    const facts = parseJson(text);

    if (truncated) {
      (facts as Record<string, unknown>)._note = 'Texten var lång och trunkerades — stämmer fakta inte, prova igen efter att du laddat upp ett kortare deck.';
    }

    await supabase
      .from('cases')
      .update({ extracted_facts: facts, facts_extracted_at: new Date().toISOString() })
      .eq('id', body.case_id);

    return json({ ok: true, facts, meta: { docs: docTexts.length, total_chars: combined.length, truncated } });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === 'AbortError') return json({ error: 'Anthropic-anropet timade ut (50s)' }, 504);
    return json({ error: 'extract failed', detail: String(e) }, 500);
  }
}

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/```json\s*([\s\S]+?)```/);
  const raw = match ? match[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    return { raw_text: text, parse_error: true };
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
