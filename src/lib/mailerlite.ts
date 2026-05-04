// Frontend client — kallar /api/mailerlite (proxy på Vercel).
// I dev (npm run dev) finns inte serverless-funktionen, så vi visar
// ett enkelt offline-meddelande istället för att krascha.

export interface MLCampaign {
  id: string;
  name: string;
  status: string;
  type?: string;
  emails?: Array<{ subject?: string }>;
  stats?: {
    sent?: number;
    open_rate?: { float?: number; string?: string };
    click_rate?: { float?: number; string?: string };
    unsubscribe_rate?: { string?: string };
  };
  dashboard_url?: string;
}

export interface MLAutomation {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type?: string;
  steps_count?: number;
  dashboard_url?: string;
}

export interface MLOffline {
  offline: true;
  reason: string;
}

async function call<T>(op: string, params: Record<string, string> = {}): Promise<T | MLOffline> {
  const qs = new URLSearchParams({ op, ...params }).toString();
  // 12s client-timeout så hängd serverless-funktion inte fryser UI:t
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`/api/mailerlite?${qs}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        offline: true,
        reason: body?.error
          ? `${body.error} (HTTP ${res.status})`
          : `HTTP ${res.status} från proxy`,
      };
    }
    return (await res.json()) as T;
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { offline: true, reason: 'MailerLite-proxyn svarade inte inom 12 sek.' };
    }
    return {
      offline: true,
      reason: `Kunde inte nå /api/mailerlite — ${String(e)}.`,
    };
  }
}

export function getSubscriberCount() {
  return call<{ total?: number; meta?: { total?: number } }>('subscriber_count');
}

export function listCampaigns(limit = 25) {
  return call<{ data?: MLCampaign[] }>('campaigns', { limit: String(limit) });
}

export function listAutomations(limit = 25) {
  return call<{ data?: MLAutomation[] }>('automations', { limit: String(limit) });
}

export function isOffline<T>(r: T | MLOffline): r is MLOffline {
  return typeof r === 'object' && r !== null && (r as MLOffline).offline === true;
}

export interface CreateCampaignInput {
  name: string;
  subject: string;
  from_name?: string;
  from_email?: string;
  content: string;
}

export async function createCampaign(input: CreateCampaignInput): Promise<
  { campaign: { id: string; name: string; dashboard_url?: string } } | { error: string }
> {
  try {
    const res = await fetch('/api/mailerlite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'create_campaign', ...input }),
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { error: `Icke-JSON svar: ${raw.slice(0, 100)}` };
    }
    if (!res.ok) {
      return { error: ((body.error as string) ?? `HTTP ${res.status}`) + ` ${JSON.stringify(body).slice(0, 200)}` };
    }
    const data = body.data as { id: string; name: string; settings?: { dashboard_url?: string } } | undefined;
    if (!data) return { error: 'unexpected response shape' };
    return {
      campaign: {
        id: data.id,
        name: data.name,
        dashboard_url: data.settings?.dashboard_url ?? `https://dashboard.mailerlite.com/campaigns/${data.id}/edit`,
      },
    };
  } catch (e) {
    return { error: 'fetch failed: ' + String(e) };
  }
}
