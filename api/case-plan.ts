// /api/case-plan — Genererar AI-marknadsplan för ett case.
// Läser case-info + dokument-metadata, anropar Marketing Strategist + Campaign Planner,
// returnerar strukturerad plan (faser, content-items, kanaler, KPI:er).
// Sparar planen i cases.marketing_plan (jsonb).

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
    return json({ error: 'config saknas', need: ['ANTHROPIC_API_KEY', 'SUPABASE_*'] }, 503);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!body.case_id) return json({ error: 'case_id required' }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Hämta case + dokument-metadata
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', body.case_id)
    .single();
  if (caseErr || !caseRow) return json({ error: 'case not found', detail: caseErr?.message }, 404);

  const { data: docs } = await supabase
    .from('case_documents')
    .select('file_name, file_type, description')
    .eq('case_id', body.case_id);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(caseRow as Record<string, unknown>, docs ?? []);

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return json({ error: 'anthropic failed', status: aiRes.status, detail: detail.slice(0, 500) }, 502);
    }

    const aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (aiData.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    const plan = parsePlan(text);

    // Spara i cases.marketing_plan
    await supabase
      .from('cases')
      .update({ marketing_plan: plan, plan_generated_at: new Date().toISOString() })
      .eq('id', body.case_id);

    return json({ ok: true, plan, raw: text });
  } catch (e) {
    return json({ error: 'plan generation failed', detail: String(e) }, 500);
  }
}

function buildSystemPrompt(): string {
  return `Du är GMF:s Marketing Strategist + Campaign Planner i en. Du genererar marknadsplaner för specifika investmentcases på GreenMerc Finance-plattformen.

GMF-kontext:
- Reglerad svensk crowdfundingsplattform under ECSPR
- 3 målgrupper: Karin (38, controller, primär), Per (46, AB-investerare), Oscar (28, tech early adopter)
- Konkurrenter: Crowdcube, Mamacrowd, Tioex, Tessin
- Brand: trygg, transparent, professionell — ALDRIG hype-språk

Du ska producera en strukturerad marknadsplan i ett specifikt JSON-format. Returnera ENDAST giltig JSON i ett \`\`\`json kodblock — ingen text utanför kodblocket.

Format:
\`\`\`json
{
  "summary": "2-3 meningar om strategin för caset",
  "primary_persona": "karin|per|oscar",
  "key_message": "huvudbudskapet i 1 mening",
  "channels_priority": ["LinkedIn", "MailerLite", "..."],
  "phases": [
    {
      "name": "Pre-launch (T-30 till T-15)",
      "starts_days_before_close": 30,
      "ends_days_before_close": 15,
      "objective": "Bygga awareness, kvalificera leads",
      "content_items": [
        {
          "title": "Konkret titel",
          "type": "blogg|linkedin|email|annons|web",
          "channel": "LinkedIn",
          "description": "Vad det handlar om i 1-2 meningar",
          "kpi": "T.ex. 200 LinkedIn-impressions, 15 leads"
        }
      ]
    }
  ],
  "risks": ["Risk 1", "Risk 2"],
  "success_metrics": ["KPI 1: target", "KPI 2: target"]
}
\`\`\`

Generera 3-5 faser. Varje fas har 2-5 content-items. Var konkret med datum (räknat från emission_close).`;
}

function buildUserPrompt(caseRow: Record<string, unknown>, docs: Array<Record<string, unknown>>): string {
  return `Generera en marknadsplan för följande case:

\`\`\`json
${JSON.stringify(caseRow, null, 2)}
\`\`\`

Tillgängliga dokument:
${docs.length === 0 ? '(inga dokument uppladdade än)' : docs.map((d) => `- ${d.file_name}${d.description ? ` — ${d.description}` : ''}`).join('\n')}

Generera planen som JSON enligt formatet i system-prompten.`;
}

function parsePlan(text: string): Record<string, unknown> {
  // Försök plocka ut JSON från ```json kodblock
  const match = text.match(/```json\s*([\s\S]+?)```/);
  const raw = match ? match[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: spara som rå text om JSON-parsning misslyckas
    return { raw_text: text, parse_error: true };
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
