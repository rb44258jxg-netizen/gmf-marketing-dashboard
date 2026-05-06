import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import type { ContentItemRow, ContentTrack, ContentType } from '../lib/database.types';
import {
  ACTIVITY_TYPE_COLOR,
  ACTIVITY_TYPE_ICON,
  ACTIVITY_TYPE_LABEL,
  CHANNELS,
  createActivity,
  deleteActivity,
  findChannel,
  listActivities,
  updateActivity,
  type ActivityStatus,
  type ActivityType,
  type MarketingActivity,
} from '../lib/activities';
import { CLAUDE_PLAN_PROMPT, parsePlan, type ParsedActivity } from '../lib/planParser';

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
  const [activities, setActivities] = useState<MarketingActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<ContentType>('linkedin');
  const [busy, setBusy] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<MarketingActivity | null>(null);
  const [showImportPlan, setShowImportPlan] = useState(false);

  async function load() {
    const [itemsRes, casesRes, activitiesPromise] = await Promise.all([
      supabase.from('content_items').select('*').not('scheduled_for', 'is', null),
      supabase.from('cases').select('id, name, emission_open, emission_close'),
      listActivities().catch((e: unknown) => {
        // Tabell saknas (migration ej körd) → bara tom lista, inte error
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('marketing_activities')) return [] as MarketingActivity[];
        throw e;
      }),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    else setItems(itemsRes.data as CalendarItem[]);
    setCases((casesRes.data as CaseRef[]) ?? []);
    setActivities(activitiesPromise as MarketingActivity[]);
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

  function activitiesForDate(iso: string): MarketingActivity[] {
    return activities.filter((a) => a.scheduled_for === iso);
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
        <div className="card-hero-title">Plan</div>
        <div className="card-hero-sub">
          Alla marknadsaktiviteter på en månadsvy — content, social-poster, e-postkampanjer, annonser, events, PR
          och case-milstolpar. Klicka på en dag för att lägga till content. Använd "+ Aktivitet" för andra typer.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="header-link primary" onClick={() => setShowImportPlan(true)}>
            📥 Importera plan från Claude
          </button>
          <button className="header-link" onClick={() => setShowActivityForm(true)}>
            + Aktivitet
          </button>
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
            const dayActivities = activitiesForDate(iso);
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
                  {dayActivities.slice(0, 3).map((a) => (
                    <div
                      key={`act-${a.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedActivity(a);
                      }}
                      style={{
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 4,
                        background: ACTIVITY_TYPE_COLOR[a.type] + '20',
                        borderLeft: `3px solid ${ACTIVITY_TYPE_COLOR[a.type]}`,
                        color: 'var(--foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        opacity: a.status === 'publicerad' ? 0.65 : 1,
                      }}
                      title={`${ACTIVITY_TYPE_LABEL[a.type]}: ${a.title} — ${a.status}`}
                    >
                      <span>{ACTIVITY_TYPE_ICON[a.type]}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
                    </div>
                  ))}
                  {dayActivities.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '2px 5px' }}>
                      +{dayActivities.length - 3} aktiviteter
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showActivityForm && (
        <AddActivityForm
          onClose={() => setShowActivityForm(false)}
          onSaved={async () => {
            setShowActivityForm(false);
            await load();
          }}
        />
      )}

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onChanged={async () => {
            await load();
          }}
          onDeleted={async () => {
            setSelectedActivity(null);
            await load();
          }}
        />
      )}

      {showImportPlan && (
        <ImportPlanModal
          onClose={() => setShowImportPlan(false)}
          onSaved={async (n) => {
            setShowImportPlan(false);
            await load();
            window.alert(`✅ ${n} aktiviteter importerade.`);
          }}
        />
      )}

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

function ImportPlanModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (count: number) => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [campaignOverride, setCampaignOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const parsed = useMemo(() => parsePlan(text), [text]);
  const finalCampaign = (campaignOverride.trim() || parsed.campaign || '').trim() || null;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CLAUDE_PLAN_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch (e) {
      setErr('Kunde inte kopiera: ' + (e as Error).message);
    }
  }

  async function importAll() {
    if (parsed.activities.length === 0) {
      setErr('Inga aktiviteter att spara.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let saved = 0;
      for (const a of parsed.activities) {
        const created = await createActivity({
          type: a.type,
          channel: a.channel,
          title: a.title,
          description: null,
          body: a.body || null,
          scheduled_for: a.scheduled_for,
          status: 'planerad',
          campaign: finalCampaign,
          case_id: null,
          owner: null,
          external_url: null,
        });
        await logAudit({
          action: 'activity.import',
          entity_type: 'marketing_activity',
          entity_id: created.id,
          before: null,
          after: created,
        });
        saved++;
      }
      await onSaved(saved);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>📥 Importera plan från Claude</h2>

        <div
          style={{
            background: 'var(--soft-cloud)',
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            marginBottom: 14,
          }}
        >
          <strong>Workflow:</strong>
          <ol style={{ paddingLeft: 18, margin: '6px 0' }}>
            <li>
              Klicka <em>"Kopiera prompt till Claude"</em> nedan
            </li>
            <li>
              Paste:a i Claude Code / claude.ai och be om en plan ("gör en plan för Q2-rundan")
            </li>
            <li>Claude svarar i rätt format → kopiera hela svaret</li>
            <li>Paste:a in svaret nedan → förhandsvisa → spara</li>
          </ol>
          <button
            className="content-action-btn"
            onClick={copyPrompt}
            style={{ marginTop: 4 }}
          >
            {promptCopied ? '✓ Kopierat — paste:a i Claude' : '📋 Kopiera prompt till Claude'}
          </button>
        </div>

        <label className="persona-input-label">Klistra in plan från Claude</label>
        <textarea
          className="persona-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={'KAMPANJ: Q2-runda\n\n2026-05-19 | linkedin | Post om Q2-rundan öppnar\n  Idag öppnar vår Q2-runda...\n\n2026-05-21 | mailerlite | Nyhetsbrev — Q2 igång\n  Hej! Vår Q2-runda öppnade på måndag...'}
          style={{ resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
        />

        <label className="persona-input-label">
          Kampanj (override — annars används KAMPANJ-rad ovan)
        </label>
        <input
          className="persona-input"
          value={campaignOverride}
          onChange={(e) => setCampaignOverride(e.target.value)}
          placeholder={parsed.campaign ?? 'Q2-runda'}
        />

        {/* Förhandsvisning */}
        {(parsed.activities.length > 0 || parsed.errors.length > 0) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Förhandsvisning ({parsed.activities.length} aktiviteter
              {finalCampaign ? ` · kampanj: ${finalCampaign}` : ''})
            </div>
            {parsed.errors.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--destructive, #c33)', marginBottom: 8 }}>
                {parsed.errors.map((e, i) => (
                  <div key={i}>⚠️ {e}</div>
                ))}
              </div>
            )}
            <div
              style={{
                maxHeight: 260,
                overflow: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              {parsed.activities.map((a, i) => (
                <ParsedRow key={i} activity={a} />
              ))}
            </div>
          </div>
        )}

        {err && (
          <div style={{ fontSize: 12, color: 'var(--destructive, #c33)', marginTop: 10 }}>{err}</div>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button
            className="btn-primary"
            onClick={importAll}
            disabled={saving || parsed.activities.length === 0}
          >
            {saving
              ? 'Sparar…'
              : `Spara ${parsed.activities.length} aktivitet${parsed.activities.length === 1 ? '' : 'er'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParsedRow({ activity }: { activity: ParsedActivity }) {
  const channel = findChannel(activity.channel);
  return (
    <div
      style={{
        padding: 10,
        borderBottom: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        gap: 10,
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>
        {activity.scheduled_for}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span
            className="badge"
            style={{ background: ACTIVITY_TYPE_COLOR[activity.type] + '25', color: ACTIVITY_TYPE_COLOR[activity.type] }}
          >
            {ACTIVITY_TYPE_ICON[activity.type]} {ACTIVITY_TYPE_LABEL[activity.type]}
          </span>
          {channel && (
            <span className="badge badge-gray">
              {channel.icon} {channel.label}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600 }}>{activity.title}</div>
        {activity.body && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted-foreground)',
              marginTop: 4,
              whiteSpace: 'pre-wrap',
              maxHeight: 80,
              overflow: 'auto',
            }}
          >
            {activity.body}
          </div>
        )}
        {activity.warnings.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--yellow, #b07d00)', marginTop: 4 }}>
            {activity.warnings.map((w, i) => (
              <div key={i}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityDetailModal({
  activity,
  onClose,
  onChanged,
  onDeleted,
}: {
  activity: MarketingActivity;
  onClose: () => void;
  onChanged: (next: MarketingActivity) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(activity.title);
  const [body, setBody] = useState(activity.body ?? '');
  const [scheduledFor, setScheduledFor] = useState(activity.scheduled_for ?? '');
  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const [externalUrl, setExternalUrl] = useState(activity.external_url ?? '');
  const [copied, setCopied] = useState(false);

  const channel = findChannel(activity.channel);

  async function copyBody() {
    if (!activity.body) return;
    try {
      await navigator.clipboard.writeText(activity.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setErr('Kunde inte kopiera: ' + (e as Error).message);
    }
  }

  async function copyAndOpen() {
    await copyBody();
    if (channel?.composerUrl) {
      window.open(channel.composerUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function markPublished() {
    setBusy(true);
    setErr(null);
    try {
      const url = window.prompt(
        'URL till den publicerade posten (valfri):',
        activity.external_url ?? '',
      );
      const updated = await updateActivity(activity.id, {
        status: 'publicerad',
        external_url: url ? url.trim() : null,
      });
      await logAudit({
        action: 'activity.publish',
        entity_type: 'marketing_activity',
        entity_id: activity.id,
        before: activity,
        after: updated,
      });
      await onChanged(updated);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    setBusy(true);
    setErr(null);
    try {
      const updated = await updateActivity(activity.id, {
        title: title.trim(),
        body: body.trim() || null,
        scheduled_for: scheduledFor || null,
        status,
        external_url: externalUrl.trim() || null,
      });
      await logAudit({
        action: 'activity.update',
        entity_type: 'marketing_activity',
        entity_id: activity.id,
        before: activity,
        after: updated,
      });
      await onChanged(updated);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Radera "${activity.title}"? Det går inte att ångra.`)) return;
    setBusy(true);
    try {
      await deleteActivity(activity.id);
      await logAudit({
        action: 'activity.delete',
        entity_type: 'marketing_activity',
        entity_id: activity.id,
        before: activity,
        after: null,
      });
      await onDeleted();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            className="badge"
            style={{ background: ACTIVITY_TYPE_COLOR[activity.type] + '25', color: ACTIVITY_TYPE_COLOR[activity.type] }}
          >
            {ACTIVITY_TYPE_ICON[activity.type]} {ACTIVITY_TYPE_LABEL[activity.type]}
          </span>
          {channel && (
            <span className="badge badge-gray">
              {channel.icon} {channel.label}
            </span>
          )}
          <span className={'badge ' + statusBadge(activity.status)}>{activity.status}</span>
        </div>

        {editing ? (
          <>
            <label className="persona-input-label">Titel</label>
            <input className="persona-input" value={title} onChange={(e) => setTitle(e.target.value)} />

            <label className="persona-input-label">Datum</label>
            <input
              className="persona-input"
              type="date"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />

            <label className="persona-input-label">Status</label>
            <select
              className="persona-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ActivityStatus)}
            >
              <option value="planerad">Planerad</option>
              <option value="redo">Redo att publicera</option>
              <option value="publicerad">Publicerad</option>
              <option value="inställd">Inställd</option>
            </select>

            <label className="persona-input-label">URL till publicerad post</label>
            <input
              className="persona-input"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
            />

            <label className="persona-input-label">Innehåll / copy</label>
            <textarea
              className="persona-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </>
        ) : (
          <>
            <h2 style={{ margin: '8px 0' }}>{activity.title}</h2>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12 }}>
              {activity.scheduled_for ? `Schemalagd ${activity.scheduled_for}` : 'Ej schemalagd'}
              {activity.campaign && ` · Kampanj: ${activity.campaign}`}
              {activity.published_at && ` · Publicerad ${new Date(activity.published_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}`}
            </div>

            {activity.external_url && (
              <div style={{ marginBottom: 12 }}>
                <a
                  href={activity.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="header-link"
                >
                  🔗 Öppna publicerad post
                </a>
              </div>
            )}

            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: 'var(--soft-cloud)',
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {activity.body ? activity.body : <em style={{ color: 'var(--muted-foreground)' }}>Inget innehåll än. Klicka Redigera för att lägga till.</em>}
            </div>
          </>
        )}

        {err && <div style={{ fontSize: 12, color: 'var(--destructive, #c33)', marginBottom: 8 }}>{err}</div>}

        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn-secondary" onClick={() => setEditing(false)} disabled={busy}>
                Avbryt
              </button>
              <button className="btn-primary" onClick={saveEdits} disabled={busy || !title.trim()}>
                {busy ? 'Sparar…' : 'Spara'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleDelete} disabled={busy} style={{ marginRight: 'auto', color: 'var(--destructive, #c33)' }}>
                🗑️ Radera
              </button>
              <button className="btn-secondary" onClick={() => setEditing(true)} disabled={busy}>
                ✏️ Redigera
              </button>
              {activity.body && (
                <button className="btn-secondary" onClick={copyBody} disabled={busy}>
                  {copied ? '✓ Kopierat' : '📋 Kopiera text'}
                </button>
              )}
              {channel?.composerUrl && (
                <button className="btn-primary" onClick={copyAndOpen} disabled={busy}>
                  🚀 Kopiera + öppna {channel.label}
                </button>
              )}
              {activity.status !== 'publicerad' && (
                <button className="btn-primary" onClick={markPublished} disabled={busy}>
                  ✅ Markera publicerad
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function statusBadge(status: ActivityStatus): string {
  switch (status) {
    case 'planerad':
      return 'badge-gray';
    case 'redo':
      return 'badge-yellow';
    case 'publicerad':
      return 'badge-green';
    case 'inställd':
      return 'badge-red';
    default:
      return 'badge-gray';
  }
}

function AddActivityForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [type, setType] = useState<ActivityType>('social_post');
  const [channel, setChannel] = useState<string>('linkedin');
  const [title, setTitle] = useState('');
  const [scheduledFor, setScheduledFor] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState('');
  const [campaign, setCampaign] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setErr('Titel krävs.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await createActivity({
        type,
        channel: channel || null,
        title: title.trim(),
        description: null,
        body: body.trim() || null,
        scheduled_for: scheduledFor || null,
        status: 'planerad',
        campaign: campaign.trim() || null,
        case_id: null,
        owner: null,
        external_url: null,
      });
      await logAudit({
        action: 'activity.create',
        entity_type: 'marketing_activity',
        entity_id: created.id,
        before: null,
        after: created,
      });
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>Lägg till aktivitet</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="persona-input-label" style={{ gridColumn: '1 / 2' }}>
            Typ
            <select className="persona-input" value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {ACTIVITY_TYPE_ICON[k as ActivityType]} {label}
                </option>
              ))}
            </select>
          </label>

          <label className="persona-input-label" style={{ gridColumn: '2 / 3' }}>
            Kanal
            <select className="persona-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="persona-input-label">Titel</label>
        <input
          className="persona-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="t.ex. LinkedIn-post om Q2-rundan"
        />

        <label className="persona-input-label">Datum</label>
        <input
          className="persona-input"
          type="date"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />

        <label className="persona-input-label">
          Kampanj-tag (valfri)
        </label>
        <input
          className="persona-input"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="t.ex. Q2-runda"
        />

        <label className="persona-input-label">
          Innehåll / copy (valfritt — kan fyllas i senare)
        </label>
        <textarea
          className="persona-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Texten som ska postas. Kan paste:as in från Claude Code."
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div className="modal-actions">
          {err && <span style={{ fontSize: 12, color: 'var(--destructive, #c33)', marginRight: 'auto' }}>{err}</span>}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Sparar…' : 'Spara aktivitet'}
          </button>
        </div>
      </div>
    </div>
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
