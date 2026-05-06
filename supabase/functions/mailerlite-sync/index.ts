// Supabase Edge Function: mailerlite-sync
//
// Push subscriber-data till MailerLite när en lead skapas eller uppdateras
// i dashboarden. Dashboarden är master — denna funktion är bara en push-pipe.
//
// Anropas från frontend via:
//   const { data, error } = await supabase.functions.invoke('mailerlite-sync', { body: {...} })
//
// Deploys via Supabase CLI eller Studio. Secrets sätts i Supabase Studio:
//   MAILERLITE_API_KEY = <bearer key>
//
// Detta är separat infrastruktur från Vercel — undviker arn1-flappen.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface SyncBody {
  /** Audience-member ID, om vi har den (för att kunna skriva tillbaka subscriber_id) */
  audience_member_id?: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  funnel_kind: 'investor' | 'project_owner';
  funnel_name: string;
  /** Status från dashboard — kan vara 'aktiv', 'pausad', 'konverterad' */
  status?: string;
  /** Segment-tags från dashboard (mappar till MailerLite custom field) */
  segment_tags?: string[];
  /** Konverteringsvärde — sätts som custom field om finns */
  conversion_value?: number | null;
}

interface MailerLiteSubscriber {
  id?: string;
  email?: string;
  status?: string;
  fields?: Record<string, unknown>;
  groups?: Array<{ id: string; name: string }>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const mlKey = Deno.env.get('MAILERLITE_API_KEY');
  if (!mlKey) {
    return json({ error: 'MAILERLITE_API_KEY ej satt — kör `supabase secrets set MAILERLITE_API_KEY=...`' }, 503);
  }

  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!body.email || !body.funnel_kind || !body.funnel_name) {
    return json({ error: 'email, funnel_kind, funnel_name krävs' }, 400);
  }

  const funnelTag = `funnel:${body.funnel_kind}:${slugify(body.funnel_name)}`;

  // MailerLite custom fields som dashboard pushar:
  // - funnel: tag-strängen (trigger-fält för automation)
  // - funnel_kind: 'investor' | 'project_owner'
  // - dashboard_status: status från dashboarden
  // - segment_tags: kommaseparerad sträng av tags
  // - conversion_value: numeriskt om konverterad
  // - dashboard_id: audience_member_id för att kunna spåra tillbaka
  const fields: Record<string, string | number> = {
    funnel: funnelTag,
    funnel_kind: body.funnel_kind,
  };
  if (body.status) fields.dashboard_status = body.status;
  if (body.segment_tags && body.segment_tags.length > 0) fields.segment_tags = body.segment_tags.join(', ');
  if (body.conversion_value != null) fields.conversion_value = body.conversion_value;
  if (body.audience_member_id) fields.dashboard_id = body.audience_member_id;
  if (body.full_name) fields.name = body.full_name;
  if (body.phone) fields.phone = body.phone;

  try {
    // 1. Skapa eller uppdatera subscriber
    // MailerLite POST /api/subscribers gör upsert via email
    const upsertRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mlKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        fields,
        status: body.status === 'pausad' ? 'unsubscribed' : 'active',
      }),
    });

    if (!upsertRes.ok) {
      const detail = await upsertRes.text();
      return json(
        {
          error: `MailerLite subscribe failed: HTTP ${upsertRes.status}`,
          detail: detail.slice(0, 500),
        },
        502,
      );
    }

    const upsertData = (await upsertRes.json()) as { data?: MailerLiteSubscriber };
    const subscriber = upsertData.data;

    return json({
      ok: true,
      subscriber_id: subscriber?.id,
      email: subscriber?.email,
      status: subscriber?.status,
      funnel_tag: funnelTag,
      fields_synced: Object.keys(fields),
    });
  } catch (e) {
    return json({ error: 'fetch failed', detail: String(e) }, 502);
  }
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
