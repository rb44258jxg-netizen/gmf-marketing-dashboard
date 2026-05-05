import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';

type RunType = 'daily-brief' | 'weekly-content-plan' | 'weekly-review';

interface RunRow {
  id: string;
  run_type: RunType;
  run_for_date: string;
  title: string;
  summary: string | null;
  body_markdown: string;
  metrics: Record<string, unknown> | null;
  items: unknown;
  bot_slug: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<RunType, string> = {
  'daily-brief': 'Daglig brief',
  'weekly-content-plan': 'Veckans content-plan',
  'weekly-review': 'Veckosammanfattning',
};

const TYPE_BADGE: Record<RunType, string> = {
  'daily-brief': 'badge-blue',
  'weekly-content-plan': 'badge-green',
  'weekly-review': 'badge-gray',
};

const FILTERS: { key: 'all' | RunType; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'daily-brief', label: 'Daglig' },
  { key: 'weekly-content-plan', label: 'Content-plan' },
  { key: 'weekly-review', label: 'Veckorapport' },
];

export default function Runs() {
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | RunType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function load() {
    const { data, error: err } = await supabase
      .from('marketing_runs')
      .select('*')
      .order('run_for_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    const list = (data as RunRow[]) ?? [];
    setRows(list);
    if (list.length > 0 && !expandedId) setExpandedId(list[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    return rows.filter((r) => r.run_type === filter);
  }, [rows, filter]);

  if (rows === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar körningar…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Körningar</div>
        <div className="card-hero-sub">
          Daglig brief, content-plan och fredagsrapport. Skriv resultatet i Claude Code och paste:a in
          här — eller låt cron-tasken POSTa hit (när Vercel-infra är på fötter igen).
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={'tab' + (filter === f.key ? ' active' : '')}
              onClick={() => setFilter(f.key)}
              style={{ cursor: 'pointer' }}
            >
              {f.label}
            </button>
          ))}
          <button
            className="header-link primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Stäng' : '+ Lägg till körning'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddRunForm
          onSaved={async () => {
            setShowAddForm(false);
            await load();
          }}
        />
      )}

      {error && <div className="auth-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <strong>Inga körningar än</strong>
          Klicka "+ Lägg till körning" för att paste:a in en daglig brief, content-plan eller veckorapport.
        </div>
      ) : (
        filtered.map((r) => (
          <div className="card" key={r.id}>
            <div className="card-title">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className={'badge ' + TYPE_BADGE[r.run_type]}>{TYPE_LABEL[r.run_type]}</span>
                {r.title}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}>
                {formatDate(r.run_for_date)} · skrev {formatTime(r.created_at)}
              </span>
            </div>

            {r.summary && (
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 8 }}>
                {r.summary}
              </div>
            )}

            <button
              className="content-action-btn"
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            >
              {expandedId === r.id ? 'Dölj detaljer' : 'Visa detaljer'}
            </button>

            {expandedId === r.id && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                  }}
                >
                  {r.body_markdown}
                </div>

                {r.metrics && Object.keys(r.metrics).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Mätvärden</div>
                    <pre className="audit-detail" style={{ margin: 0 }}>
                      {JSON.stringify(r.metrics, null, 2)}
                    </pre>
                  </div>
                )}

                {Array.isArray(r.items) && r.items.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                      Items ({r.items.length})
                    </div>
                    <pre className="audit-detail" style={{ margin: 0 }}>
                      {JSON.stringify(r.items, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}

function AddRunForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [runType, setRunType] = useState<RunType>('daily-brief');
  const [runForDate, setRunForDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !body.trim() || !runForDate) {
      setErr('Titel, datum och innehåll måste fyllas i.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from('marketing_runs')
        .upsert(
          {
            run_type: runType,
            run_for_date: runForDate,
            title: title.trim(),
            summary: summary.trim() || null,
            body_markdown: body.trim(),
            bot_slug: null,
          },
          { onConflict: 'run_type,run_for_date' },
        )
        .select()
        .single();
      if (error) {
        setErr(error.message);
        return;
      }
      await logAudit({
        action: 'marketing_run.paste',
        entity_type: 'marketing_run',
        entity_id: `${runType}:${runForDate}`,
        after: { title, length: body.length },
      });
      // Återställ formen
      setTitle('');
      setSummary('');
      setBody('');
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Lägg till körning</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>Typ</span>
          <select
            value={runType}
            onChange={(e) => setRunType(e.target.value as RunType)}
            style={inputStyle}
          >
            <option value="daily-brief">Daglig brief</option>
            <option value="weekly-content-plan">Veckans content-plan</option>
            <option value="weekly-review">Veckosammanfattning</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>Datum (YYYY-MM-DD)</span>
          <input
            type="date"
            value={runForDate}
            onChange={(e) => setRunForDate(e.target.value)}
            style={inputStyle}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>Titel</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="t.ex. Daily Brief — 2026-05-05"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>
          Sammanfattning (valfri, en mening i listan)
        </span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="t.ex. Subscribers +12, kampanj X klar, fokus på Cases nästa vecka"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>Innehåll (markdown)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Klistra in körningens fulla innehåll här…"
          style={{ ...inputStyle, minHeight: 220, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sparar…' : 'Spara körning'}
        </button>
        {err && <span style={{ fontSize: 12, color: 'var(--error, #c33)' }}>{err}</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
        Samma datum + typ skriver över tidigare körning (upsert).
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
}
