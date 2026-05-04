import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import type { ContentItemRow, ContentTrack, ContentType } from '../lib/database.types';

interface CalendarItem extends ContentItemRow {
  case_id?: string | null;
  scheduled_for?: string | null;
}

interface CaseRef {
  id: string;
  name: string;
  emission_open: string | null;
  emission_close: string | null;
}

const TYPE_ICONS: Record<ContentType, string> = {
  blogg: '📝',
  linkedin: '💼',
  email: '✉️',
  annons: '📢',
  web: '🌐',
};

const TRACK_COLORS: Record<ContentTrack, string> = {
  platform: 'var(--blue)',
  case: 'var(--purple)',
  internal: 'var(--muted-foreground)',
};

const STATUS_COLORS: Record<string, string> = {
  utkast: 'var(--muted-foreground)',
  granskning: 'var(--yellow)',
  redo: 'var(--green)',
  publicerad: 'var(--deep-teal)',
};

export default function Calendar() {
  const [month, setMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [cases, setCases] = useState<CaseRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<ContentType>('linkedin');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [itemsRes, casesRes] = await Promise.all([
      supabase.from('content_items').select('*').not('scheduled_for', 'is', null),
      supabase.from('cases').select('id, name, emission_open, emission_close'),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    else setItems(itemsRes.data as CalendarItem[]);
    setCases((casesRes.data as CaseRef[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const grid = useMemo(() => buildMonthGrid(month.year, month.month), [month]);

  function shift(delta: number) {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function thisMonth() {
    const d = new Date();
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function itemsForDate(iso: string): CalendarItem[] {
    return items.filter((i) => i.scheduled_for === iso);
  }

  function caseEventsForDate(iso: string): Array<{ case: CaseRef; kind: 'open' | 'close' }> {
    const events: Array<{ case: CaseRef; kind: 'open' | 'close' }> = [];
    cases.forEach((c) => {
      if (c.emission_open === iso) events.push({ case: c, kind: 'open' });
      if (c.emission_close === iso) events.push({ case: c, kind: 'close' });
    });
    return events;
  }

  async function quickAdd(date: string) {
    if (!draftTitle.trim()) return;
    setBusy(true);
    try {
      const { data, error: err } = await supabase
        .from('content_items')
        .insert({
          title: draftTitle.trim(),
          type: draftType,
          status: 'utkast',
          scheduled_for: date,
        })
        .select()
        .single();
      if (err) {
        setError(err.message);
        return;
      }
      await logAudit({
        action: 'content.create',
        entity_type: 'content_item',
        entity_id: (data as ContentItemRow).id,
        before: null,
        after: data,
      });
      setShowAdd(null);
      setDraftTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const monthName = new Date(month.year, month.month, 1).toLocaleDateString('sv-SE', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Content-kalender</div>
        <div className="card-hero-sub">
          Allt schemalagt material och alla case-milstolpar på en månadsvy. Klicka på en dag för att lägga till.
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="content-action-btn" onClick={() => shift(-1)}>
              ←
            </button>
            <button className="content-action-btn" onClick={thisMonth}>
              Idag
            </button>
            <button className="content-action-btn" onClick={() => shift(1)}>
              →
            </button>
            <span style={{ marginLeft: 12, fontSize: 16, fontWeight: 800, color: 'var(--deep-teal)', textTransform: 'capitalize' }}>
              {monthName}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted-foreground)' }}>
            <span><span style={{ color: 'var(--blue)' }}>●</span> GMF</span>
            <span><span style={{ color: 'var(--purple)' }}>●</span> Case</span>
            <span><span style={{ color: 'var(--destructive)' }}>●</span> Deadline</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 11, marginBottom: 4 }}>
          {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((d) => (
            <div key={d} style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {grid.map((day, i) => {
            const inMonth = day.getMonth() === month.month;
            const iso = toIso(day);
            const dayItems = itemsForDate(iso);
            const events = caseEventsForDate(iso);
            const isToday = iso === today;
            return (
              <div
                key={i}
                onClick={() => inMonth && setShowAdd(iso)}
                style={{
                  minHeight: 100,
                  padding: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: inMonth ? 'var(--card)' : 'var(--soft-cloud)',
                  opacity: inMonth ? 1 : 0.5,
                  cursor: inMonth ? 'pointer' : 'default',
                  position: 'relative',
                  ...(isToday ? { borderColor: 'var(--deep-teal)', borderWidth: 2, padding: 5 } : {}),
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'var(--deep-teal)' : 'var(--foreground)',
                    marginBottom: 4,
                  }}
                >
                  {day.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {events.map((ev, j) => (
                    <Link
                      key={`ev-${j}`}
                      to={`/cases?id=${ev.case.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 4,
                        background: 'var(--red-bg)',
                        color: '#a3343f',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                      title={`${ev.case.name} — emission ${ev.kind === 'open' ? 'öppnar' : 'STÄNGER'}`}
                    >
                      {ev.kind === 'open' ? '▶' : '⏰'} {ev.case.name}
                    </Link>
                  ))}
                  {dayItems.slice(0, 3).map((it) => {
                    const trackColor = it.track ? TRACK_COLORS[it.track] : 'var(--muted-foreground)';
                    return (
                      <Link
                        key={it.id}
                        to={`/content`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 10,
                          padding: '2px 5px',
                          borderRadius: 4,
                          background: 'var(--soft-cloud)',
                          borderLeft: `3px solid ${trackColor}`,
                          color: 'var(--foreground)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                        title={`${it.title} — ${it.status}`}
                      >
                        <span>{TYPE_ICONS[it.type]}</span>
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: STATUS_COLORS[it.status] ?? 'gray',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                      </Link>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '2px 5px' }}>
                      +{dayItems.length - 3} till
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Schemalägg innehåll — {showAdd}</h2>
            <label className="persona-input-label">Titel</label>
            <input
              className="persona-input"
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') quickAdd(showAdd);
              }}
            />
            <label className="persona-input-label">Typ</label>
            <select
              className="persona-input"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as ContentType)}
            >
              <option value="blogg">Blogg</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">E-post</option>
              <option value="annons">Annons</option>
              <option value="web">Webb</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 8 }}>
              Skapas som utkast. Redigera typ/spår/case i Content Library.
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAdd(null)} disabled={busy}>
                Avbryt
              </button>
              <button className="btn-primary" onClick={() => quickAdd(showAdd)} disabled={busy || !draftTitle.trim()}>
                {busy ? 'Sparar…' : 'Lägg till'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const firstDayOfWeek = (first.getDay() + 6) % 7; // Måndag = 0
  const start = new Date(year, month, 1 - firstDayOfWeek);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) {
    grid.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return grid;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
