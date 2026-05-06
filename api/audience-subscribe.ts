// /api/audience-subscribe — Lägger till en lead som MailerLite-prenumerant +
// taggar med funnel-namn så MailerLite-automation triggar mejlserien.
//
// Best-effort: om MailerLite failar skapas leaden ändå i Supabase (frontend
// hanterar det), och teamet kan tagga manuellt. Ingen 5min-hang ska blockera
// dashboarden.
//
// Edge runtime — undviker Node-bundle-strul.

export const runtime = 'edge';
export const maxDuration = 15;

interface SubscribeBody {
  email: string;
  full_name?: string | null;
  funnel_kind: 'investor' | 'project_owner';
  funnel_name: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const mlKey = (typeof process !== 'undefined' && process.env?.MAILERLITE_API_KEY) || '';
  if (!mlKey) {
    return json({ error: 'MAILERLITE_API_KEY ej konfigurerad' }, 503);
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!body.email || !body.funnel_kind || !body.funnel_name) {
    return json({ error: 'email, funnel_kind, funnel_name krävs' }, 400);
  }

  // Slugify funnel-namn till en MailerLite-grupp-tag
  const groupName = `funnel:${body.funnel_kind}:${slugify(body.funnel_name)}`;

  try {
    // 1. Skapa/uppdatera prenumerant
    const subRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mlKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        fields: body.full_name ? { name: body.full_name } : {},
        groups: [], // grupp läggs till efter med korrekt id (om vi har det)
      }),
    });

    if (!subRes.ok) {
      const detail = await subRes.text();
      return json({ error: `MailerLite subscribe failed: HTTP ${subRes.status}`, detail: detail.slice(0, 300) }, 502);
    }

    const subData = (await subRes.json()) as { data?: { id?: string } };
    const subscriberId = subData.data?.id;

    // 2. Lägg till en custom field eller tagg för funnel-namn
    // (MailerLite v2 API använder grupper. För enkelhet sätter vi bara en
    // custom-field "funnel" på prenumeranten — automation kan triggas på
    // field-värde-ändring i MailerLite's UI.)
    if (subscriberId) {
      await fetch(`https://connect.mailerlite.com/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${mlKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          fields: {
            funnel: groupName,
            funnel_kind: body.funnel_kind,
          },
        }),
      }).catch(() => {
        // ignorera fält-update-fel — prenumeranten finns oavsett
      });
    }

    return json({ ok: true, subscriber_id: subscriberId, group: groupName });
  } catch (e) {
    return json({ error: 'fetch failed', detail: String(e) }, 502);
  }
}

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
    headers: { 'content-type': 'application/json' },
  });
}
