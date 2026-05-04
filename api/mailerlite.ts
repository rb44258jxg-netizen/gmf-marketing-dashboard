// Vercel Serverless Function — proxy mot MailerLite Classic API.
// Frontend kallar /api/mailerlite?op=<operation>. API-keyen läses från
// Vercel env (MAILERLITE_API_KEY) och exponeras aldrig till webbläsaren.

const ML_BASE = 'https://connect.mailerlite.com/api';

type Op = 'subscriber_count' | 'campaigns' | 'automations' | 'subscribers';

const ALLOWED_OPS: Op[] = ['subscriber_count', 'campaigns', 'automations', 'subscribers'];

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const op = url.searchParams.get('op') as Op | null;
  const limit = url.searchParams.get('limit') ?? '25';

  if (!op || !ALLOWED_OPS.includes(op)) {
    return json({ error: 'invalid op', allowed: ALLOWED_OPS }, 400);
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    return json(
      {
        error: 'MAILERLITE_API_KEY saknas',
        hint: 'Lägg till miljövariabeln i Vercel Project Settings → Environment Variables.',
      },
      503,
    );
  }

  const target = mapOp(op, limit);
  try {
    const res = await fetch(target, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, max-age=30',
      },
    });
  } catch (e) {
    return json({ error: 'mailerlite fetch failed', detail: String(e) }, 502);
  }
}

function mapOp(op: Op, limit: string): string {
  const safeLimit = encodeURIComponent(limit);
  switch (op) {
    case 'subscriber_count':
      // /subscribers?limit=0 returns count via meta
      return `${ML_BASE}/subscribers?limit=0`;
    case 'campaigns':
      return `${ML_BASE}/campaigns?limit=${safeLimit}`;
    case 'automations':
      return `${ML_BASE}/automations?limit=${safeLimit}`;
    case 'subscribers':
      return `${ML_BASE}/subscribers?limit=${safeLimit}`;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config = { runtime: 'edge' };
