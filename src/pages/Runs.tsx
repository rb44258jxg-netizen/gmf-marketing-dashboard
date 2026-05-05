import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
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
      if (list.length > 0) setExpandedId(list[0].id);
    }
    load();
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
        <div className="card-hero-title">Schemalagda körningar</div>
        <div className="card-hero-sub">
          Daglig brief, veckans content-plan och fredagsrapport från marketing-bottarna landar här —
          inte i Slack eller mejl. Alla output går rakt in i dashboarden.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <strong>Inga körningar än</strong>
          Daglig brief körs vardagar 08:26, content-plan måndagar 09:42, veckorapport fredagar 16:13.
          När de skrivit hit dyker resultaten upp här.
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
