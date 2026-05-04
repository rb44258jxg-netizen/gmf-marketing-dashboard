// /api/case-plan — Genererar AI-marknadsplan för ett case.
// Använder cases.extracted_facts om de finns (mer specifik plan); annars
// bara case-fält + dokument-metadata.

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_TIMEOUT_MS = 50000; // 50s — lämnar 10s marginal till Vercel-killen

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

  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', body.case_id)
    .single();
  if (caseErr || !caseRow) return json({ error: 'case not found' }, 404);

  const { data: docs } = await supabase
    .from('case_documents')
    .select('file_name, file_type, description')
    .eq('case_id', body.case_id);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(caseRow as Record<string, unknown>, docs ?? []);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

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
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
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
    const plan = parsePlan(text);

    await supabase
      .from('cases')
      .update({ marketing_plan: plan, plan_generated_at: new Date().toISOString() })
      .eq('id', body.case_id);

    return json({ ok: true, plan });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === 'AbortError') return json({ error: `Anthropic-anropet timade ut (${ANTHROPIC_TIMEOUT_MS / 1000}s). Prova igen.` }, 504);
    return json({ error: 'plan generation failed', detail: String(e) }, 500);
  }
}

function buildSystemPrompt(): string {
  return `Du är GMF:s Marketing Strategist + Campaign Planner. Du genererar marknadsplaner för investmentcases på GreenMerc Finance.

GMF-kontext: Reglerad svensk crowdfundingsplattform (ECSPR). 3 personas: Karin (38, controller, primär), Per (46, AB-investerare), Oscar (28, tech). Brand: trygg, transparent, professionell — aldrig hype.

Returnera ENDAST JSON i ett \`\`\`json kodblock. Inga ord utanför.

Format (3-4 faser, 2-4 items per fas):
\`\`\`json
{
  "summary": "2 meningar",
  "primary_persona": "karin|per|oscar",
  "key_message": "1 mening",
  "channels_priority": ["LinkedIn", "MailerLite", "..."],
  "phases": [
    {
      "name": "Pre-launch (T-30 till T-15)",
      "starts_days_before_close": 30,
      "ends_days_before_close": 15,
      "objective": "1 mening",
      "content_items": [
        { "title": "Konkret titel", "type": "blogg|linkedin|email|annons", "channel": "LinkedIn", "description": "1 mening", "kpi": "T.ex. 200 imp, 15 leads" }
      ]
    }
  ],
  "risks": ["Risk 1", "Risk 2"],
  "success_metrics": ["KPI: target"]
}
\`\`\``;
}

function buildUserPrompt(caseRow: Record<string, unknown>, docs: Array<Record<string, unknown>>): string {
  const facts = caseRow.extracted_facts as Record<string, unknown> | null;
  return `Generera en marknadsplan för:

**Case:** ${caseRow.name} (${caseRow.sector})
**Sökt belopp:** ${caseRow.target_amount_sek ? `${(Number(caseRow.target_amount_sek) / 1_000_000).toFixed(1)} MSEK` : 'okänt'}
**Stänger:** ${caseRow.emission_close ?? 'ej satt'}
**Beskrivning:** ${caseRow.description ?? '(ingen)'}

${facts ? `**Bolagsfakta (extraherade från pitch deck):**\n\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\`\n\nBasera planen på dessa fakta.` : `**Dokument:** ${docs.length === 0 ? '(inga uppladdade)' : docs.map((d) => d.file_name).join(', ')}`}`;
}

function parsePlan(text: string): Record<string, unknown> {
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
