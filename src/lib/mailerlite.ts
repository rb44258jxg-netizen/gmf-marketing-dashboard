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
  try {
    const res = await fetch(`/api/mailerlite?${qs}`);
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
    return {
      offline: true,
      reason: `Kunde inte nå /api/mailerlite — ${String(e)}. (Lokal dev har ingen proxy; testa på Vercel-URL.)`,
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
