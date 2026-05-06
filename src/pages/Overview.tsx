import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSubscriberCount, isOffline, listCampaigns, type MLCampaign } from '../lib/mailerlite';
import {
  ACTIVITY_TYPE_COLOR,
  ACTIVITY_TYPE_ICON,
  ACTIVITY_TYPE_LABEL,
  findChannel,
  updateActivity,
  type ActivityStatus,
  type MarketingActivity,
} from '../lib/activities';
import type { ContentItemRow } from '../lib/database.types';

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

      <TodayModule />

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
        <Link to="/cases" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>🎯 Cases — bolagsmarknadsföring</span>
          <span>→</span>
        </Link>
        <Link to="/knowledge" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Knowledge — {s.loading ? '…' : s.personas} personas + {s.competitors} konkurrenter</span>
          <span>→</span>
        </Link>
        <Link to="/content" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Content library — {s.drafts} utkast, {s.ready} redo</span>
          <span>→</span>
        </Link>
        <Link to="/calendar" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>📅 Kalender</span>
          <span>→</span>
        </Link>
        <Link to="/analytics" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>📊 Analytics</span>
          <span>→</span>
        </Link>
        <Link to="/briefing" className="header-link" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>📋 Veckobriefing</span>
          <span>→</span>
        </Link>
        <Link to="/chat" className="header-link" style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>🤖 Chatta med marketing-bottar</span>
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

// ============================================================================
// Idag-modul — vad ska publiceras idag/imorgon, med copy + composer-knappar
// ============================================================================

const STATUS_BADGE: Record<ActivityStatus, { label: string; color: string }> = {
  planerad: { label: 'Planerad', color: 'var(--blue)' },
  redo: { label: 'Redo', color: 'var(--green)' },
  publicerad: { label: 'Publicerad', color: 'var(--deep-teal)' },
  inställd: { label: 'Inställd', color: 'var(--destructive)' },
};

function TodayModule() {
  const [today, setToday] = useState<MarketingActivity[]>([]);
  const [tomorrow, setTomorrow] = useState<MarketingActivity[]>([]);
  const [todayContent, setTodayContent] = useState<ContentItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = tomorrowDate.toISOString().slice(0, 10);

  async function load() {
    setLoading(true);
    const [todayRes, tomorrowRes, contentRes] = await Promise.all([
      supabase
        .from('marketing_activities')
        .select('*')
        .eq('scheduled_for', todayIso)
        .order('created_at', { ascending: true }),
      supabase
        .from('marketing_activities')
        .select('*')
        .eq('scheduled_for', tomorrowIso)
        .order('created_at', { ascending: true }),
      supabase.from('content_items').select('*').eq('scheduled_for', todayIso),
    ]);
    if (todayRes.error?.message?.includes('marketing_activities')) {
      setTableMissing(true);
    } else {
      setToday((todayRes.data as MarketingActivity[]) ?? []);
      setTomorrow((tomorrowRes.data as MarketingActivity[]) ?? []);
    }
    setTodayContent((contentRes.data as ContentItemRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (tableMissing) return null;

  const totalToday = today.length + todayContent.length;

  return (
    <div className="card">
      <div className="card-title">
        <span>
          📌 Idag — {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <Link to="/plan?view=list" className="header-link" style={{ fontSize: 12 }}>
          Hela planen →
        </Link>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Hämtar dagens aktiviteter…</div>
      ) : totalToday === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--muted-foreground)',
            padding: '20px 0',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          Inget schemalagt idag.{' '}
          <Link to="/plan" style={{ color: 'var(--deep-teal)' }}>
            Gå till planen
          </Link>{' '}
          för att lägga till en aktivitet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.map((a) => (
            <ActivityRow key={a.id} activity={a} onUpdated={load} />
          ))}
          {todayContent.map((c) => (
            <ContentItemRowCard key={c.id} item={c} />
          ))}
        </div>
      )}

      {tomorrow.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              marginBottom: 8,
              letterSpacing: 0.5,
            }}
          >
            Imorgon ({tomorrow.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tomorrow.slice(0, 3).map((a) => {
              const badge = STATUS_BADGE[a.status];
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    padding: '4px 0',
                    minWidth: 0,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{ACTIVITY_TYPE_ICON[a.type]}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)' }}>{a.title}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: badge.color,
                      color: 'white',
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      flexShrink: 0,
                    }}
                  >
                    {badge.label}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }}>{ACTIVITY_TYPE_LABEL[a.type]}</span>
                </div>
              );
            })}
            {tomorrow.length > 3 && (
              <Link
                to="/plan?view=list"
                style={{ fontSize: 11, color: 'var(--deep-teal)', textDecoration: 'none' }}
              >
                +{tomorrow.length - 3} till →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ activity: a, onUpdated }: { activity: MarketingActivity; onUpdated: () => void | Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const channel = findChannel(a.channel);
  const badge = STATUS_BADGE[a.status];

  async function copyBody() {
    const txt = a.body ?? a.description ?? a.title;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_e) {
      // noop
    }
  }

  async function markPublished() {
    setBusy(true);
    try {
      await updateActivity(a.id, { status: 'publicerad', published_at: new Date().toISOString() });
      await onUpdated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: 10,
        background: 'var(--soft-cloud)',
        borderRadius: 8,
        borderLeft: `4px solid ${ACTIVITY_TYPE_COLOR[a.type]}`,
        opacity: a.status === 'publicerad' ? 0.65 : 1,
      }}
    >
      <span style={{ fontSize: 22 }}>{ACTIVITY_TYPE_ICON[a.type]}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>{a.title}</strong>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 10,
              background: badge.color,
              color: 'white',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {badge.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{ACTIVITY_TYPE_LABEL[a.type]}</span>
          {channel && (
            <>
              <span>·</span>
              <span>
                {channel.icon} {channel.label}
              </span>
            </>
          )}
          {a.campaign && (
            <>
              <span>·</span>
              <span>🎯 {a.campaign}</span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {(a.body || a.description) && (
          <button
            onClick={copyBody}
            className="content-action-btn"
            style={{ fontSize: 11, padding: '5px 10px' }}
            title="Kopiera text till urklipp"
          >
            {copied ? '✓ Kopierat' : '📋 Kopiera'}
          </button>
        )}
        {channel?.composerUrl && a.status !== 'publicerad' && (
          <a
            href={channel.composerUrl}
            target="_blank"
            rel="noreferrer"
            className="content-action-btn"
            style={{
              fontSize: 11,
              padding: '5px 10px',
              background: 'var(--deep-teal)',
              color: 'white',
              textDecoration: 'none',
            }}
            title={`Öppna ${channel.label}-composer i ny flik`}
          >
            ↗ {channel.label}
          </a>
        )}
        {a.status !== 'publicerad' && (
          <button
            onClick={markPublished}
            disabled={busy}
            className="content-action-btn"
            style={{ fontSize: 11, padding: '5px 10px' }}
            title="Markera som publicerad"
          >
            {busy ? '…' : '✓ Klart'}
          </button>
        )}
      </div>
    </div>
  );
}

function ContentItemRowCard({ item }: { item: ContentItemRow }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: 10,
        background: 'var(--soft-cloud)',
        borderRadius: 8,
        borderLeft: `4px solid var(--blue)`,
      }}
    >
      <span style={{ fontSize: 22 }}>📄</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{item.title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          Content library · {item.type} · {item.status}
        </div>
      </div>
      <Link
        to="/content"
        className="content-action-btn"
        style={{ fontSize: 11, padding: '5px 10px', textDecoration: 'none' }}
      >
        Öppna →
      </Link>
    </div>
  );
}
