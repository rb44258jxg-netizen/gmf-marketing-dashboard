import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AuditLogRow } from '../lib/database.types';

const PAGE_SIZE = 100;

export default function Audit() {
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (err) setError(err.message);
      else setRows(data as AuditLogRow[]);
    }
    load();
  }, []);

  if (rows === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar audit-logg…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Audit-logg</div>
        <div className="card-hero-sub">
          Alla ändringar i personas och content sparas här. Senaste {PAGE_SIZE} händelser.
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="audit-row header-row">
          <div>Tidpunkt</div>
          <div>Användare</div>
          <div>Åtgärd</div>
          <div>Detaljer</div>
        </div>
        {rows.length === 0 && (
          <div className="empty-state">
            <strong>Inga audit-händelser än</strong>
            Skapa eller redigera personas och innehåll så loggas det här.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="audit-row">
            <div className="audit-when">{formatTime(r.created_at)}</div>
            <div style={{ fontSize: 11 }}>{r.actor_email ?? '—'}</div>
            <div>
              <span className={'badge ' + actionBadge(r.action)}>{r.action}</span>
            </div>
            <div>
              <button
                className="content-action-btn"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                {expandedId === r.id ? 'Dölj' : 'Visa diff'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 8 }}>
                {r.entity_type} {r.entity_id ? r.entity_id.slice(0, 8) : ''}
              </span>
              {expandedId === r.id && (
                <div className="audit-detail" style={{ marginTop: 8 }}>
                  {formatDiff(r)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'medium' });
}

function actionBadge(action: string): string {
  if (action.endsWith('.create')) return 'badge-green';
  if (action.endsWith('.delete')) return 'badge-red';
  if (action.endsWith('.update') || action.endsWith('.status')) return 'badge-blue';
  return 'badge-gray';
}

function formatDiff(r: AuditLogRow): string {
  const before = r.before ?? {};
  const after = r.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines: string[] = [];
  for (const k of keys) {
    if (k === 'updated_at' || k === 'created_at') continue;
    const b = (before as Record<string, unknown>)[k];
    const a = (after as Record<string, unknown>)[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    lines.push(`${k}: ${stringify(b)}  →  ${stringify(a)}`);
  }
  if (lines.length === 0) return JSON.stringify(after, null, 2);
  return lines.join('\n');
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v;
  return JSON.stringify(v);
}
