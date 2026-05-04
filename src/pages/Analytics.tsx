import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { isOffline, listCampaigns, type MLCampaign } from '../lib/mailerlite';
import AskBot from '../components/AskBot';

interface Item {
  id: string;
  title: string;
  type: string;
  status: string;
  track: string | null;
  case_id: string | null;
  created_at: string;
  published_at: string | null;
  scheduled_for: string | null;
}

const COLORS = {
  blogg: '#a270db',
  linkedin: '#269dd9',
  email: '#15a37e',
  annons: '#f5b83d',
  web: '#73848c',
  utkast: '#73848c',
  granskning: '#f5b83d',
  redo: '#15a37e',
  publicerad: '#1d8775',
  platform: '#269dd9',
  case: '#a270db',
  internal: '#73848c',
};

const TEAL = '#1d8775';
const MINT = '#72cab8';

export default function Analytics() {
  const [items, setItems] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<MLCampaign[]>([]);
  const [mlOffline, setMlOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [itemsRes, mlRes] = await Promise.all([
        supabase.from('content_items').select('*').order('created_at', { ascending: true }),
        listCampaigns(50),
      ]);
      setItems((itemsRes.data as Item[]) ?? []);
      if (isOffline(mlRes)) {
        setMlOffline(true);
      } else {
        setCampaigns(mlRes.data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const byType = useMemo(() => groupBy(items, 'type'), [items]);
  const byStatus = useMemo(() => groupBy(items, 'status'), [items]);
  const byTrack = useMemo(() => groupBy(items, 'track'), [items]);
  const velocity = useMemo(() => contentVelocity(items, 12), [items]);
  const emailTrend = useMemo(() => emailPerformanceTrend(campaigns), [campaigns]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar siffror…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Analytics</div>
        <div className="card-hero-sub">
          Innehållsproduktion, e-postresultat och pipeline-fördelning. Uppdateras live från Supabase + MailerLite.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot
            botSlug="analytics-reporter"
            label="Analysera dessa siffror"
            prefill={`Analysera vår nuvarande pipeline:\n\n- ${items.length} content-items totalt\n- Per typ: ${JSON.stringify(byType)}\n- Per status: ${JSON.stringify(byStatus)}\n- Per spår: ${JSON.stringify(byTrack)}\n${campaigns.length > 0 ? `- ${campaigns.length} MailerLite-kampanjer` : ''}\n\nVad ser du? Topp-3 insikter och vad ska vi prioritera?`}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        <div className="card">
          <div className="card-title">Innehåll per typ</div>
          {byType.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byType} dataKey="count" nameKey="key" outerRadius={80} label={({ name }: { name?: string }) => name ?? ''}>
                  {byType.map((d) => (
                    <Cell key={d.key} fill={(COLORS as Record<string, string>)[d.key] ?? '#999'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="card-title">Pipeline-status</div>
          {byStatus.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="key" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count">
                  {byStatus.map((d) => (
                    <Cell key={d.key} fill={(COLORS as Record<string, string>)[d.key] ?? '#999'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="card-title">Spår-fördelning</div>
          {byTrack.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byTrack} dataKey="count" nameKey="key" outerRadius={80} label={({ name }: { name?: string }) => name || 'okänd'}>
                  {byTrack.map((d) => (
                    <Cell key={d.key ?? 'okänd'} fill={(COLORS as Record<string, string>)[d.key] ?? '#999'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="card-title">Innehåll per vecka (senaste 12)</div>
          {velocity.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={velocity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="created" name="Skapat" fill={MINT} />
                <Bar dataKey="published" name="Publicerat" fill={TEAL} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">
          E-postprestanda — öppnings- och klickfrekvens per kampanj
          {mlOffline && <span className="badge badge-yellow">MailerLite ej kopplad</span>}
        </div>
        {mlOffline ? (
          <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            Lägg till <code>MAILERLITE_API_KEY</code> i Vercel för att se kampanjresultat.
          </div>
        ) : emailTrend.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={emailTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} unit="%" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="open" name="Öppning" stroke={TEAL} strokeWidth={2} dot />
              <Line type="monotone" dataKey="click" name="Klick" stroke="#269dd9" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}

function Empty() {
  return (
    <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: 'var(--muted-foreground)' }}>
      Inga datapunkter än.
    </div>
  );
}

function groupBy<T>(items: T[], key: keyof T): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  items.forEach((i) => {
    const k = ((i[key] as unknown as string) ?? 'okänd') as string;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return Array.from(m.entries()).map(([key, count]) => ({ key, count }));
}

function contentVelocity(items: Item[], weeks: number): Array<{ label: string; created: number; published: number }> {
  const buckets: Array<{ label: string; created: number; published: number; weekStart: number }> = [];
  const now = new Date();
  const monday = (() => {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const label = `v${getWeek(start)}`;
    buckets.push({ label, created: 0, published: 0, weekStart: start.getTime() });
  }
  items.forEach((it) => {
    const created = new Date(it.created_at).getTime();
    const published = it.published_at ? new Date(it.published_at).getTime() : null;
    buckets.forEach((b, i) => {
      const next = buckets[i + 1]?.weekStart ?? Number.POSITIVE_INFINITY;
      if (created >= b.weekStart && created < next) b.created++;
      if (published !== null && published >= b.weekStart && published < next) b.published++;
    });
  });
  return buckets.map(({ label, created, published }) => ({ label, created, published }));
}

function getWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function emailPerformanceTrend(
  campaigns: MLCampaign[],
): Array<{ name: string; open: number; click: number }> {
  return campaigns
    .filter((c) => c.status === 'sent' && c.stats?.open_rate?.float !== undefined)
    .slice(0, 12)
    .reverse()
    .map((c) => ({
      name: c.name.slice(0, 20),
      open: ((c.stats?.open_rate?.float ?? 0) * 100),
      click: ((c.stats?.click_rate?.float ?? 0) * 100),
    }));
}
