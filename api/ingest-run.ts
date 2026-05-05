// Ingest-endpoint för schemalagda marketing-körningar.
// Lokala Claude Code scheduled-tasks (~/.claude/scheduled-tasks/marketing-*)
// POSTar hit istället för att posta till Slack/canvas. Allt landar i
// public.marketing_runs och visas i dashboardens "Körningar"-flik.
//
// Auth: shared secret i header `Authorization: Bearer <INGEST_SECRET>`.

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

type RunType = 'daily-brief' | 'weekly-content-plan' | 'weekly-review';

interface IngestPayload {
  run_type: RunType;
  run_for_date: string;
  title: string;
  summary?: string;
  body_markdown: string;
  metrics?: Record<string, unknown>;
  items?: unknown;
  bot_slug?: string;
}

const RUN_TYPES: RunType[] = ['daily-brief', 'weekly-content-plan', 'weekly-review'];

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) {
    return json({ error: 'INGEST_SECRET ej satt på servern' }, 503);
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${ingestSecret}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'supabase config saknas' }, 503);
  }

  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const errors: string[] = [];
  if (!RUN_TYPES.includes(payload.run_type)) {
    errors.push(`run_type must be one of ${RUN_TYPES.join(', ')}`);
  }
  if (!payload.run_for_date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.run_for_date)) {
    errors.push('run_for_date must be YYYY-MM-DD');
  }
  if (!payload.title || payload.title.length > 200) {
    errors.push('title required (≤200 chars)');
  }
  if (!payload.body_markdown || payload.body_markdown.length < 1) {
    errors.push('body_markdown required');
  }
  if (errors.length > 0) {
    return json({ error: 'validation failed', errors }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('marketing_runs')
    .upsert(
      {
        run_type: payload.run_type,
        run_for_date: payload.run_for_date,
        title: payload.title,
        summary: payload.summary ?? null,
        body_markdown: payload.body_markdown,
        metrics: payload.metrics ?? null,
        items: payload.items ?? null,
        bot_slug: payload.bot_slug ?? null,
      },
      { onConflict: 'run_type,run_for_date' },
    )
    .select()
    .single();

  if (error) {
    return json({ error: 'save failed', detail: error.message }, 500);
  }

  return json({ ok: true, run: data });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
