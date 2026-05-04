// Vercel Edge Function — proxy mot Anthropic Messages API.
// Tar emot { system, messages } och svarar med ren text (icke-streaming för enkelhet).
// API-keyen läses från ANTHROPIC_API_KEY (server-side env, aldrig browser).

interface ChatBody {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  max_tokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json(
      {
        error: 'ANTHROPIC_API_KEY saknas',
        hint: 'Lägg till miljövariabeln i Vercel Project Settings → Environment Variables.',
      },
      503,
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!body.system || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'system and messages are required' }, 400);
  }

  // Trimma långa konversationer till sista 30 meddelanden för att hålla kostnaderna nere
  const trimmed = body.messages.slice(-30);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model ?? DEFAULT_MODEL,
        max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
        system: body.system,
        messages: trimmed,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return json(
        { error: 'Anthropic API error', status: res.status, detail: errBody.slice(0, 500) },
        res.status,
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };

    const text = (data.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    return json({
      text,
      usage: data.usage,
      stop_reason: data.stop_reason,
    });
  } catch (e) {
    return json({ error: 'fetch failed', detail: String(e) }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config = { runtime: 'edge' };
