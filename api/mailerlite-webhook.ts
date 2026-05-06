// /api/mailerlite-webhook — tar emot events från MailerLite och loggar dem
// som audience_events i Supabase.
//
// Detta är en INKOMMANDE webhook — Vercel hanterar inkommande POST även när
// utgående functions hänger (separat code path), så detta fungerar pålitligt.
//
// MailerLite skickar webhook-events när:
// - subscriber.created
// - subscriber.updated
// - subscriber.unsubscribed
// - subscriber.bounced
// - subscriber.added_to_group
// - subscriber.removed_from_group
// - campaign.sent (mejl skickat)
// - campaign.opened (mottagaren öppnat)
// - campaign.clicked (klickat länk)
// - automation.completed
//
// Vi mappar event till motsvarande audience_event-typ via subscriber.email
// eller subscriber.fields.dashboard_id.
//
// Konfigureras i MailerLite-panelen:
//   Integrations → Webhooks → New webhook
//   URL: https://gmf-marketing-dashboard.vercel.app/api/mailerlite-webhook
//   Secret: <MAILERLITE_WEBHOOK_SECRET> (sätts på båda sidor)
//   Events: alla relevanta

import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const maxDuration = 10;

interface MLWebhookEvent {
  type?: string;
  // MailerLite v2 webhook payload — strukturen kan variera
  data?: {
    subscriber?: {
      id?: string;
      email?: string;
      fields?: Record<string, unknown>;
    };
    campaign?: {
      id?: string;
      name?: string;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'supabase config saknas' }, 503);
  }

  // Optional: signaturverifiering om MAILERLITE_WEBHOOK_SECRET är satt
  const expectedSecret = process.env.MAILERLITE_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided =
      readHeader(req, 'x-mailerlite-signature') ??
      readHeader(req, 'authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== expectedSecret) {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  let payload: MLWebhookEvent;
  try {
    payload = (await req.json()) as MLWebhookEvent;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const eventType = mapEventType(payload.type ?? '');
  const sub = payload.data?.subscriber;
  const subscriberId = sub?.id;
  const email = sub?.email?.toLowerCase();
  const dashboardId = (sub?.fields?.dashboard_id as string | undefined) || null;

  // Hitta motsvarande audience_member
  let memberId: string | null = null;
  if (dashboardId) {
    memberId = dashboardId;
  } else if (subscriberId) {
    const { data } = await supabase
      .from('audience_members')
      .select('id')
      .eq('mailerlite_subscriber_id', subscriberId)
      .maybeSingle();
    memberId = (data as { id: string } | null)?.id ?? null;
  }
  if (!memberId && email) {
    const { data } = await supabase
      .from('audience_members')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    memberId = (data as { id: string } | null)?.id ?? null;
  }

  if (!memberId) {
    // Vi vet inte vem detta är — logga ändå men skip insert
    return json({
      ok: true,
      skipped: true,
      reason: 'no matching audience_member',
      event_type: payload.type,
      email,
    });
  }

  // Logga event
  const { error: evErr } = await supabase.from('audience_events').insert({
    audience_member_id: memberId,
    event_type: eventType,
    data: {
      mailerlite_event: payload.type,
      mailerlite_subscriber_id: subscriberId,
      campaign: payload.data?.campaign,
      raw: payload,
    },
  });
  if (evErr) return json({ error: 'event insert failed', detail: evErr.message }, 500);

  // Sidoeffekter på vissa event-typer
  if (payload.type === 'subscriber.unsubscribed') {
    await supabase.from('audience_members').update({ status: 'pausad' }).eq('id', memberId);
  }

  // Spara subscriber_id om vi inte hade det
  if (subscriberId) {
    await supabase
      .from('audience_members')
      .update({ mailerlite_subscriber_id: subscriberId })
      .eq('id', memberId);
  }

  return json({ ok: true, member_id: memberId, event_type: eventType });
}

/** Mappa MailerLite-event-namn till våra audience_event_type. */
function mapEventType(mlType: string): string {
  switch (mlType) {
    case 'subscriber.created':
      return 'mailerlite_synced';
    case 'subscriber.updated':
      return 'mailerlite_synced';
    case 'subscriber.unsubscribed':
      return 'mailerlite_synced';
    case 'subscriber.bounced':
      return 'mailerlite_synced';
    case 'campaign.sent':
      return 'step_started';
    case 'campaign.opened':
      return 'opened';
    case 'campaign.clicked':
      return 'clicked';
    case 'automation.completed':
      return 'step_completed';
    default:
      return 'manual_note';
  }
}

function readHeader(req: Request, name: string): string | null {
  const headers = req.headers as unknown as
    | Headers
    | Record<string, string | string[] | undefined>;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const lower = name.toLowerCase();
  const raw = (headers as Record<string, string | string[] | undefined>)[lower];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
