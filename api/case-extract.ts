// /api/case-extract — AI läser uppladdade case-dokument (PDF) och extraherar
// strukturerade bolagsfakta som sparas i cases.extracted_facts.

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

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

  // Hämta första PDF-dokumentet som base64. Anthropic stöder PDF direkt i messages.
  const pdfDocs = (docs ?? []).filter((d: { file_type: string }) =>
    (d.file_type ?? '').includes('pdf'),
  );
  if (pdfDocs.length === 0) {
    return json({ error: 'inga PDF-dokument uppladdade än för detta case' }, 400);
  }

  const primary = pdfDocs[0] as { file_path: string; file_name: string };
  const { data: fileData, error: dlErr } = await supabase.storage
    .from('case-documents')
    .download(primary.file_path);
  if (dlErr || !fileData) return json({ error: 'kunde inte ladda dokumentet', detail: dlErr?.message }, 502);

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

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
    "Konkret resultat eller milstolpe (siffror!)",
    "Annat"
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

  const userPrompt = `Extrahera bolagsfakta från detta pitch deck.

Bolag: ${caseRow.name}
Sektor: ${caseRow.sector}
${caseRow.description ? `Existerande beskrivning: ${caseRow.description}` : ''}`;

  // Anthropic-anrop med 50s timeout (inom Vercel 60s)
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      }),
    });
    clearTimeout(timer);

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return json({ error: 'anthropic failed', status: aiRes.status, detail: detail.slice(0, 400) }, 502);
    }

    const aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (aiData.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    const facts = parseJson(text);

    await supabase
      .from('cases')
      .update({ extracted_facts: facts, facts_extracted_at: new Date().toISOString() })
      .eq('id', body.case_id);

    return json({ ok: true, facts });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === 'AbortError') return json({ error: 'Anthropic-anropet timade ut (50s)' }, 504);
    return json({ error: 'extract failed', detail: String(e) }, 500);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // Node.js har Buffer; Edge har btoa. Vi använder Node.js runtime så Buffer finns.
  return Buffer.from(binary, 'binary').toString('base64');
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
