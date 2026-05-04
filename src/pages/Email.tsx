import { useEffect, useState } from 'react';
import {
  getSubscriberCount,
  isOffline,
  listAutomations,
  listCampaigns,
  type MLAutomation,
  type MLCampaign,
} from '../lib/mailerlite';
import AskBot from '../components/AskBot';

interface State {
  loading: boolean;
  subs: number | null;
  campaigns: MLCampaign[];
  automations: MLAutomation[];
  offlineReason: string | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Skickad', cls: 'badge-green' },
  draft: { label: 'Utkast', cls: 'badge-yellow' },
  ready: { label: 'Redo', cls: 'badge-blue' },
};

export default function Email() {
  const [s, setS] = useState<State>({
    loading: true,
    subs: null,
    campaigns: [],
    automations: [],
    offlineReason: null,
  });

  useEffect(() => {
    (async () => {
      const [count, camps, autos] = await Promise.all([
        getSubscriberCount(),
        listCampaigns(25),
        listAutomations(25),
      ]);
      const offline = [count, camps, autos].find(isOffline);
      if (offline) {
        setS({
          loading: false,
          subs: null,
          campaigns: [],
          automations: [],
          offlineReason: offline.reason,
        });
        return;
      }
      const total = !isOffline(count) ? count.total ?? count.meta?.total ?? 0 : 0;
      const cl = !isOffline(camps) ? camps.data ?? [] : [];
      const al = !isOffline(autos) ? autos.data ?? [] : [];
      setS({ loading: false, subs: total, campaigns: cl, automations: al, offlineReason: null });
    })();
  }, []);

  if (s.loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Hämtar från MailerLite…
      </div>
    );
  }

  const sent = s.campaigns.filter((c) => c.status === 'sent');
  let bestOpen = 0;
  let bestClick = 0;
  sent.forEach((c) => {
    const o = c.stats?.open_rate?.float ?? 0;
    const k = c.stats?.click_rate?.float ?? 0;
    if (o > bestOpen) bestOpen = o;
    if (k > bestClick) bestClick = k;
  });

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">E-postkampanjer</div>
        <div className="card-hero-sub">
          Live-data från MailerLite. Klicka "Öppna MailerLite" för att redigera kampanjer.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot botSlug="email-specialist" label="Skriv ett mail" variant="on-dark" />
          <AskBot botSlug="analytics-reporter" label="Analysera resultaten" variant="on-dark" />
        </div>
      </div>

      {s.offlineReason && (
        <div className="card" style={{ borderColor: 'var(--yellow)', background: 'var(--yellow-bg)' }}>
          <div style={{ fontSize: 13, color: '#8a6411' }}>
            <strong>MailerLite ej kopplad än:</strong> {s.offlineReason}
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Lägg till <code>MAILERLITE_API_KEY</code> i Vercel → Project Settings → Environment
              Variables. API-keyen hittar du i MailerLite under Integrations → Developer API.
            </div>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi highlight">
          <div className="kpi-label">Prenumeranter</div>
          <div className="kpi-value">{fmt(s.subs)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bästa öppningsfrekvens</div>
          <div className="kpi-value">{bestOpen ? (bestOpen * 100).toFixed(1) + '%' : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bästa klickfrekvens</div>
          <div className="kpi-value">{bestClick ? (bestClick * 100).toFixed(1) + '%' : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kampanjer totalt</div>
          <div className="kpi-value">{s.campaigns.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Kampanjer
          <a
            href="https://dashboard.mailerlite.com/campaigns"
            target="_blank"
            rel="noreferrer"
            className="header-link"
          >
            Öppna MailerLite →
          </a>
        </div>
        {s.campaigns.length === 0 ? (
          <div className="empty-state">
            <strong>Inga kampanjer än</strong>
            {s.offlineReason ? 'Aktivera MailerLite-keyen för att se data.' : 'Skapa en kampanj i MailerLite för att se den här.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Kampanj</th>
                <th>Status</th>
                <th>Skickade</th>
                <th>Öppn.</th>
                <th>Klick</th>
              </tr>
            </thead>
            <tbody>
              {s.campaigns.map((c) => {
                const sb = STATUS_BADGE[c.status] ?? { label: c.status, cls: 'badge-gray' };
                const stats = c.stats ?? {};
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <br />
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                        {c.emails?.[0]?.subject ?? ''}
                      </span>
                    </td>
                    <td>
                      <span className={'badge ' + sb.cls}>{sb.label}</span>
                    </td>
                    <td>{stats.sent ?? '—'}</td>
                    <td>{stats.open_rate?.string ?? '—'}</td>
                    <td>{stats.click_rate?.string ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">Automatiseringar</div>
        {s.automations.length === 0 ? (
          <div className="empty-state">
            <strong>Inga automatiseringar</strong>
            Skapa welcome-flow eller drip-sekvens i MailerLite.
          </div>
        ) : (
          <div>
            {s.automations.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--mint)',
                    color: 'var(--deep-teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  }}
                >
                  ⚡
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    {(a.trigger_type ?? '').replace(/_/g, ' ')} — {a.steps_count ?? 0} steg
                  </div>
                </div>
                <span className={'badge ' + (a.enabled ? 'badge-green' : 'badge-red')}>
                  {a.enabled ? 'Aktiv' : 'Inaktiv'}
                </span>
                {a.dashboard_url && (
                  <a href={a.dashboard_url} target="_blank" rel="noreferrer" className="header-link">
                    Öppna →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('sv-SE');
}
