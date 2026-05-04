import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSubscriberCount, isOffline, listCampaigns, type MLCampaign } from '../lib/mailerlite';

interface State {
  loading: boolean;
  personas: number;
  content: number;
  drafts: number;
  ready: number;
  competitors: number;
  subs: number | null;
  bestOpen: number;
  sent: number;
  latest: MLCampaign | null;
  mlOffline: boolean;
}

export default function Overview() {
  const [s, setS] = useState<State>({
    loading: true,
    personas: 0,
    content: 0,
    drafts: 0,
    ready: 0,
    competitors: 0,
    subs: null,
    bestOpen: 0,
    sent: 0,
    latest: null,
    mlOffline: false,
  });

  useEffect(() => {
    // Ladda Supabase-räkningar först (snabbt). MailerLite parallellt utan att blockera.
    (async () => {
      const [personas, content, drafts, ready, competitors] = await Promise.all([
        supabase.from('personas').select('*', { count: 'exact', head: true }),
        supabase.from('content_items').select('*', { count: 'exact', head: true }),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('status', 'utkast'),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('status', 'redo'),
        supabase.from('competitors').select('*', { count: 'exact', head: true }),
      ]);
      setS((prev) => ({
        ...prev,
        loading: false,
        personas: personas.count ?? 0,
        content: content.count ?? 0,
        drafts: drafts.count ?? 0,
        ready: ready.count ?? 0,
        competitors: competitors.count ?? 0,
      }));
    })();
    (async () => {
      const [count, camps] = await Promise.all([getSubscriberCount(), listCampaigns(25)]);
      const mlOffline = isOffline(count) || isOffline(camps);
      const subs = !mlOffline && !isOffline(count) ? count.total ?? count.meta?.total ?? 0 : null;
      const list = !mlOffline && !isOffline(camps) ? camps.data ?? [] : [];
      const sentList = list.filter((c) => c.status === 'sent');
      const bestOpen = sentList.reduce((m, c) => Math.max(m, c.stats?.open_rate?.float ?? 0), 0);
      setS((prev) => ({
        ...prev,
        subs,
        bestOpen,
        sent: sentList.length,
        latest: sentList[0] ?? null,
        mlOffline,
      }));
    })();
  }, []);

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Välkommen till GMF Marknadsteam</div>
        <div className="card-hero-sub">
          Personas, content, konkurrenter, e-post och audit — allt sparas live i Supabase och delas av hela teamet.
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi highlight">
          <div className="kpi-label">Prenumeranter</div>
          <div className="kpi-value">{s.loading ? '—' : fmt(s.subs)}</div>
          <div className="kpi-sub">{s.mlOffline ? 'MailerLite ej kopplad' : 'MailerLite'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kampanjer skickade</div>
          <div className="kpi-value">{s.loading ? '—' : s.mlOffline ? '—' : s.sent}</div>
          <div className="kpi-sub">totalt</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bästa öppningsfrekvens</div>
          <div className="kpi-value">
            {s.loading ? '—' : s.bestOpen ? (s.bestOpen * 100).toFixed(1) + '%' : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Innehåll producerat</div>
          <div className="kpi-value">{s.loading ? '—' : s.content}</div>
          <div className="kpi-sub">texter & material</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Senaste e-postkampanjen
          {!s.mlOffline && <span className="badge badge-green">Live data</span>}
        </div>
        {s.loading ? (
          <div className="loading">
            <div className="spinner" />
            Hämtar…
          </div>
        ) : s.mlOffline ? (
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            MailerLite är inte kopplad än. Lägg till <code>MAILERLITE_API_KEY</code> i Vercel-projektets
            Environment Variables för att se data här.
          </div>
        ) : !s.latest ? (
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Inga skickade kampanjer ännu.</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong>{s.latest.name}</strong>
              {s.latest.dashboard_url && (
                <a href={s.latest.dashboard_url} target="_blank" rel="noreferrer" className="header-link">
                  Se rapport →
                </a>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12 }}>
              {s.latest.emails?.[0]?.subject ?? ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
              <Stat label="Skickade" value={String(s.latest.stats?.sent ?? 0)} color="var(--deep-teal)" />
              <Stat label="Öppnade" value={s.latest.stats?.open_rate?.string ?? '—'} color="var(--green)" />
              <Stat label="Klickade" value={s.latest.stats?.click_rate?.string ?? '—'} color="var(--blue)" />
              <Stat
                label="Avslutat"
                value={s.latest.stats?.unsubscribe_rate?.string ?? '0%'}
                color="var(--muted-foreground)"
              />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Snabbåtgärder</div>
        <Link to="/personas" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Personas — {s.loading ? '…' : s.personas} profiler</span>
          <span>→</span>
        </Link>
        <Link to="/content" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Content library — {s.drafts} utkast, {s.ready} redo</span>
          <span>→</span>
        </Link>
        <Link to="/competitors" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Konkurrenter — {s.competitors} bevakade</span>
          <span>→</span>
        </Link>
        <Link to="/email" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>E-postkampanjer (MailerLite)</span>
          <span>→</span>
        </Link>
        <Link to="/audit" className="header-link" style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Audit-logg</span>
          <span>→</span>
        </Link>
      </div>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{label}</div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('sv-SE');
}
