// Vercel cron-trigad funktion: genererar veckobriefing varje måndag 06:00.
// Vercel skickar automatiskt header `Authorization: Bearer <CRON_SECRET>`
// till cron-anropade routes — vi verifierar för att förhindra missbruk.
//
// Använder Supabase service-key (server-side only) för att läsa data och
// skriva briefingen. RLS bypass för att läsa över alla användare.

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

interface MLCampaign {
  id: string;
  name: string;
  status: string;
  emails?: Array<{ subject?: string }>;
  stats?: { sent?: number; open_rate?: { string?: string }; click_rate?: { string?: string } };
}

export default async function handler(req: Request): Promise<Response> {
  // Cron auth: Vercel sätter Authorization-header med CRON_SECRET.
  // För manuell test: skicka samma header.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const mlKey = process.env.MAILERLITE_API_KEY;

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return json(
      { error: 'config saknas', need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'] },
      503,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Veckans måndag (svenska veckan börjar måndag)
  const weekStart = mondayOf(new Date());
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(weekStart.getTime() - 7 * 24 * 3600 * 1000);

  try {
    // 1. Content-pipeline
    const { data: contentItems } = await supabase
      .from('content_items')
      .select('title, type, status, track, updated_at')
      .gte('updated_at', sevenDaysAgo.toISOString())
      .order('updated_at', { ascending: false });

    // 2. Audit-händelser senaste veckan (vad har teamet gjort?)
    const { data: auditEvents } = await supabase
      .from('audit_log')
      .select('action, entity_type, actor_email, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    // 3. MailerLite — senaste skickade kampanjer (om kopplat)
    let mlCampaigns: MLCampaign[] = [];
    if (mlKey) {
      try {
        const r = await fetch('https://connect.mailerlite.com/api/campaigns?limit=10', {
          headers: { Authorization: `Bearer ${mlKey}`, Accept: 'application/json' },
        });
        if (r.ok) {
          const data = (await r.json()) as { data?: MLCampaign[] };
          mlCampaigns = (data.data ?? []).filter((c) => c.status === 'sent').slice(0, 5);
        }
      } catch {
        // ignorera mailerlite-fel — fortsätt utan
      }
    }

    const context = {
      week_starting: weekStartIso,
      content_changes: contentItems ?? [],
      audit_events: auditEvents ?? [],
      mailerlite_recent: mlCampaigns,
      mailerlite_connected: Boolean(mlKey),
    };

    // 4. Generera briefing
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return json({ error: 'anthropic failed', status: aiRes.status, detail: detail.slice(0, 500) }, 502);
    }

    const aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const body = (aiData.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    // 5. Spara
    const title = `Måndagsbriefing ${weekStartIso}`;
    const { data: saved, error: saveErr } = await supabase
      .from('briefings')
      .upsert(
        {
          generated_for_week_starting: weekStartIso,
          title,
          body,
          context,
          bot_slug: 'marketing-strategist',
        },
        { onConflict: 'generated_for_week_starting' },
      )
      .select()
      .single();

    if (saveErr) {
      return json({ error: 'save failed', detail: saveErr.message, body_preview: body.slice(0, 200) }, 500);
    }

    return json({ ok: true, briefing: saved });
  } catch (e) {
    return json({ error: 'briefing failed', detail: String(e) }, 500);
  }
}

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // söndag → -6, måndag → 0, …
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function buildSystemPrompt(): string {
  return `Du är GMF:s Marketing Strategist som genererar måndagsbriefing för marknadsteamet.

Format (markdown):
1. **TL;DR** — 2-3 meningar om läget just nu
2. **Vecka som varit** — vad teamet gjorde (use audit_events + content_changes)
3. **E-post** — senaste kampanjresultat (om data finns), annars hoppa
4. **Veckans 3 prioriteringar** — konkret, mätbart, koppla till spår (GMF/Case)
5. **Risker att hålla koll på** — 1-2 punkter
6. **Bottar att använda** — vilka av Brand Guardian / Content Writer / Email Specialist etc. teamet ska aktivera denna vecka

Var konkret med siffror. Var ärlig — om datan är tunn, säg det. Skriv på svenska.
Längd: 400-700 ord.`;
}

function buildUserPrompt(context: Record<string, unknown>): string {
  return `Här är data för måndagsbriefingen ${(context as { week_starting: string }).week_starting}:\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\nGenerera briefingen.`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
