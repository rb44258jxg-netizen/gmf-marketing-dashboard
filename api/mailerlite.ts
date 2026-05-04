// Vercel Serverless Function — proxy mot MailerLite API.
// GET ?op=<read-operation>          — läs (subscribers, campaigns, automations)
// POST { op: "create_campaign", … } — skriv (skapar utkast)

const ML_BASE = 'https://connect.mailerlite.com/api';

type ReadOp = 'subscriber_count' | 'campaigns' | 'automations' | 'subscribers';
type WriteOp = 'create_campaign';

const ALLOWED_READ: ReadOp[] = ['subscriber_count', 'campaigns', 'automations', 'subscribers'];
const ALLOWED_WRITE: WriteOp[] = ['create_campaign'];

export const maxDuration = 30;

export default async function handler(req: Request): Promise<Response> {
  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    return json(
      { error: 'MAILERLITE_API_KEY saknas', hint: 'Lägg till i Vercel env.' },
      503,
    );
  }

  if (req.method === 'GET') {
    return handleRead(req, key);
  }
  if (req.method === 'POST') {
    return handleWrite(req, key);
  }
  return json({ error: 'method not allowed' }, 405);
}

async function handleRead(req: Request, key: string): Promise<Response> {
  const url = new URL(req.url);
  const op = url.searchParams.get('op') as ReadOp | null;
  const limit = url.searchParams.get('limit') ?? '25';

  if (!op || !ALLOWED_READ.includes(op)) {
    return json({ error: 'invalid read op', allowed: ALLOWED_READ }, 400);
  }

  const target = mapReadOp(op, limit);
  return forward(target, { method: 'GET', key });
}

async function handleWrite(req: Request, key: string): Promise<Response> {
  let body: { op?: WriteOp; [k: string]: unknown };
  try {
    body = (await req.json()) as { op?: WriteOp; [k: string]: unknown };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!body.op || !ALLOWED_WRITE.includes(body.op)) {
    return json({ error: 'invalid write op', allowed: ALLOWED_WRITE }, 400);
  }

  if (body.op === 'create_campaign') {
    return createCampaign(body, key);
  }
  return json({ error: 'unhandled op' }, 400);
}

async function createCampaign(input: Record<string, unknown>, key: string): Promise<Response> {
  // MailerLite create campaign
  // Required: name, type (regular), emails: [{ subject, from_name, from, content }]
  // Refs: https://developers.mailerlite.com/docs/campaigns.html#create-a-campaign
  const name = (input.name as string) ?? 'GMF — utkast';
  const subject = (input.subject as string) ?? 'GMF Update';
  const fromName = (input.from_name as string) ?? 'GreenMerc Finance';
  const fromEmail = (input.from_email as string) ?? 'noreply@greenmerc.com';
  const content = (input.content as string) ?? '';

  const payload = {
    name,
    type: 'regular',
    emails: [
      {
        subject,
        from_name: fromName,
        from: fromEmail,
        content: content,
      },
    ],
  };

  const target = `${ML_BASE}/campaigns`;
  return forward(target, { method: 'POST', key, body: JSON.stringify(payload) });
}

function mapReadOp(op: ReadOp, limit: string): string {
  const safeLimit = encodeURIComponent(limit);
  switch (op) {
    case 'subscriber_count':
      return `${ML_BASE}/subscribers?limit=0`;
    case 'campaigns':
      return `${ML_BASE}/campaigns?limit=${safeLimit}`;
    case 'automations':
      return `${ML_BASE}/automations?limit=${safeLimit}`;
    case 'subscribers':
      return `${ML_BASE}/subscribers?limit=${safeLimit}`;
  }
}

async function forward(
  target: string,
  opts: { method: string; key: string; body?: string },
): Promise<Response> {
  try {
    const res = await fetch(target, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${opts.key}`,
        Accept: 'application/json',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (e) {
    return json({ error: 'mailerlite fetch failed', detail: String(e) }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
