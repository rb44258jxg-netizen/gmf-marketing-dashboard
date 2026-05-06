import { useEffect, useMemo, useState } from 'react';
import {
  createAudienceMember,
  getFunnelStats,
  KIND_LABEL,
  listAudienceEvents,
  listAudienceMembers,
  listFunnels,
  listFunnelSteps,
  logAudienceEvent,
  STATUS_BADGE,
  STATUS_LABEL,
  STEP_TYPE_ICON,
  STEP_TYPE_LABEL,
  subscribeToMailerLite,
  updateAudienceMember,
  type AudienceEvent,
  type AudienceKind,
  type AudienceMember,
  type Funnel,
  type FunnelStats,
  type FunnelStep,
  type MemberStatus,
} from '../lib/audience';
import { logAudit } from '../lib/audit';

const KIND_TABS: AudienceKind[] = ['investor', 'project_owner'];

export default function Funnels() {
  const [kind, setKind] = useState<AudienceKind>('investor');
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [stats, setStats] = useState<Record<string, FunnelStats>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<AudienceMember | null>(null);
  const [statusFilter, setStatusFilter] = useState<MemberStatus | 'alla'>('alla');

  async function load() {
    setLoading(true);
    try {
      const [fns, mems] = await Promise.all([listFunnels(kind), listAudienceMembers(kind)]);
      setFunnels(fns);
      setMembers(mems);
      const statsMap: Record<string, FunnelStats> = {};
      for (const f of fns) {
        const s = await getFunnelStats(f.id);
        if (s) statsMap[f.id] = s;
      }
      setStats(statsMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const filteredMembers = useMemo(() => {
    if (statusFilter === 'alla') return members;
    return members.filter((m) => m.status === statusFilter);
  }, [members, statusFilter]);

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Funnels — {KIND_LABEL[kind]}</div>
        <div className="card-hero-sub">
          Automatiserade marknadsförings-tunnlar för nya användare. När en lead läggs till taggas de
          i MailerLite (best-effort) och syns på listan med tunnel-progress.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {KIND_TABS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={'tab' + (kind === k ? ' active' : '')}
              style={{ cursor: 'pointer' }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
          <button
            className="header-link primary"
            onClick={() => setShowAdd(true)}
            style={{ marginLeft: 'auto' }}
          >
            + Lägg till lead
          </button>
        </div>
      </div>

      {/* Stats per funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }}>
        {funnels.map((f) => {
          const s = stats[f.id];
          if (!s) return null;
          return (
            <div className="card" key={f.id} style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                {f.name}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--deep-teal)', marginTop: 4 }}>
                {s.total_members}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                {s.converted} konverterade · {s.paused} pausade
              </div>
              <FunnelStepsBar funnelId={f.id} stats={s} />
            </div>
          );
        })}
      </div>

      {/* Filter + lista */}
      <div className="card">
        <div className="card-title">
          <span>Leads ({filteredMembers.length})</span>
          <select
            className="content-action-btn"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MemberStatus | 'alla')}
          >
            <option value="alla">Alla statusar</option>
            <option value="aktiv">Aktiva i tunnel</option>
            <option value="pausad">Pausade</option>
            <option value="konverterad">Konverterade</option>
          </select>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: 20 }}>
            <div className="spinner" /> Laddar…
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="empty-state">
            <strong>Inga leads {statusFilter !== 'alla' ? `med status "${statusFilter}"` : 'än'}</strong>
            Klicka "+ Lägg till lead" för att starta första {KIND_LABEL[kind].toLowerCase()}-tunneln.
          </div>
        ) : (
          <div className="audit-row header-row">
            <div>E-post</div>
            <div>Namn</div>
            <div>Steg</div>
            <div>Status</div>
            <div>Tillagd</div>
          </div>
        )}
        {!loading && filteredMembers.map((m) => (
          <div
            key={m.id}
            className="audit-row"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelected(m)}
          >
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{m.email ?? '—'}</div>
            <div>{m.full_name ?? '—'}</div>
            <div>Steg {m.current_step}</div>
            <div>
              <span className={'badge ' + STATUS_BADGE[m.status]}>{STATUS_LABEL[m.status]}</span>
            </div>
            <div className="audit-when">{new Date(m.joined_funnel_at).toLocaleDateString('sv-SE')}</div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddLeadModal
          kind={kind}
          funnels={funnels}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}

      {selected && (
        <LeadDetailModal
          member={selected}
          onClose={() => setSelected(null)}
          onChanged={async (next) => {
            setSelected(next);
            await load();
          }}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Stats-bar för en funnel
// ----------------------------------------------------------------------------

function FunnelStepsBar({ funnelId, stats }: { funnelId: string; stats: FunnelStats }) {
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  useEffect(() => {
    listFunnelSteps(funnelId).then(setSteps).catch(() => setSteps([]));
  }, [funnelId]);

  if (steps.length === 0) return null;
  const total = stats.total_members || 1;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {steps.map((s) => {
          const count = stats.by_step.find((b) => b.step === s.step_index)?.count ?? 0;
          const pct = (count / total) * 100;
          return (
            <div
              key={s.id}
              title={`Steg ${s.step_index}: ${s.title} — ${count} personer`}
              style={{
                flex: 1,
                height: 24,
                background: count > 0 ? 'var(--deep-teal)' : 'var(--soft-cloud)',
                borderRadius: 3,
                opacity: count > 0 ? Math.max(0.3, pct / 100) : 0.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: count > 0 ? 'white' : 'var(--muted-foreground)',
                fontWeight: 700,
              }}
            >
              {count > 0 ? count : ''}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: 'var(--muted-foreground)', marginTop: 4 }}>
        Steg 1 → {steps.length} (höver för detaljer)
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lägg till lead-modal
// ----------------------------------------------------------------------------

function AddLeadModal({
  kind,
  funnels,
  onClose,
  onSaved,
}: {
  kind: AudienceKind;
  funnels: Funnel[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [funnelId, setFunnelId] = useState<string>(funnels[0]?.id ?? '');
  const [externalId, setExternalId] = useState('');
  const [registeredAt, setRegisteredAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<string>('finance.greenmerc.com');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mlStatus, setMlStatus] = useState<string | null>(null);

  async function handleSave() {
    if (!email.trim() || !funnelId) {
      setErr('E-post och funnel krävs.');
      return;
    }
    setSaving(true);
    setErr(null);
    setMlStatus(null);
    try {
      const member = await createAudienceMember({
        kind,
        email: email.trim(),
        full_name: fullName.trim() || null,
        funnel_id: funnelId,
        external_id: externalId.trim() || null,
        registered_at: registeredAt ? new Date(registeredAt).toISOString() : null,
        source: source.trim() || 'manuell',
        notes: notes.trim() || null,
      });
      await logAudienceEvent({
        audience_member_id: member.id,
        event_type: 'joined',
        data: { funnel_id: funnelId, source },
      });
      await logAudit({
        action: 'audience_member.create',
        entity_type: 'audience_member',
        entity_id: member.id,
        before: null,
        after: member,
      });

      // Best-effort: tagga i MailerLite
      const funnel = funnels.find((f) => f.id === funnelId);
      if (funnel) {
        setMlStatus('Skickar till MailerLite…');
        const ml = await subscribeToMailerLite({
          email: email.trim(),
          full_name: fullName.trim() || null,
          funnel_kind: kind,
          funnel_name: funnel.name,
        });
        if (ml.ok) {
          if (ml.subscriber_id) {
            await updateAudienceMember(member.id, { mailerlite_subscriber_id: ml.subscriber_id });
          }
          await logAudienceEvent({
            audience_member_id: member.id,
            event_type: 'mailerlite_synced',
            data: { subscriber_id: ml.subscriber_id ?? null },
          });
          setMlStatus('✓ MailerLite-tagging klar');
        } else {
          setMlStatus(`⚠️ MailerLite failade: ${ml.error}. Lead är sparad i dashboarden — tagga manuellt i MailerLite-panelen.`);
        }
      }

      // Liten paus så användaren ser MailerLite-status
      setTimeout(() => onSaved(), 800);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Lägg till {KIND_LABEL[kind].toLowerCase()}</h2>

        <label className="persona-input-label">E-post *</label>
        <input
          className="persona-input"
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="anna@example.com"
        />

        <label className="persona-input-label">Namn</label>
        <input
          className="persona-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Anna Andersson"
        />

        <label className="persona-input-label">Funnel</label>
        <select
          className="persona-input"
          value={funnelId}
          onChange={(e) => setFunnelId(e.target.value)}
        >
          {funnels.length === 0 && <option value="">⚠️ Ingen funnel finns — kör seed-migrationen</option>}
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="persona-input-label" style={{ gridColumn: '1 / 2' }}>
            Reggad-datum (på finance-sidan)
            <input
              className="persona-input"
              type="date"
              value={registeredAt}
              onChange={(e) => setRegisteredAt(e.target.value)}
            />
          </label>
          <label className="persona-input-label" style={{ gridColumn: '2 / 3' }}>
            External ID (admin/investerare-id)
            <input
              className="persona-input"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="123456"
            />
          </label>
        </div>

        <label className="persona-input-label">Källa</label>
        <select className="persona-input" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="finance.greenmerc.com">finance.greenmerc.com (registrerad)</option>
          <option value="linkedin">LinkedIn</option>
          <option value="manuell">Manuell (av teamet)</option>
          <option value="csv">CSV-import</option>
        </select>

        <label className="persona-input-label">Anteckningar (valfritt)</label>
        <textarea
          className="persona-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="t.ex. nämnde Karin-persona, signalintresse för fastighet"
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />

        {err && <div style={{ fontSize: 12, color: 'var(--destructive, #c33)', marginTop: 8 }}>{err}</div>}
        {mlStatus && <div style={{ fontSize: 12, marginTop: 8 }}>{mlStatus}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !email.trim() || !funnelId}>
            {saving ? 'Sparar…' : 'Lägg till + tagga i MailerLite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lead-detalj-modal
// ----------------------------------------------------------------------------

function LeadDetailModal({
  member,
  onClose,
  onChanged,
}: {
  member: AudienceMember;
  onClose: () => void;
  onChanged: (next: AudienceMember) => void | Promise<void>;
}) {
  const [events, setEvents] = useState<AudienceEvent[]>([]);
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    listAudienceEvents(member.id).then(setEvents).catch(() => setEvents([]));
    if (member.funnel_id) {
      listFunnelSteps(member.funnel_id).then(setSteps).catch(() => setSteps([]));
    }
  }, [member.id, member.funnel_id]);

  const currentStepDef = steps.find((s) => s.step_index === member.current_step);
  const nextStepDef = steps.find((s) => s.step_index === member.current_step + 1);

  async function advanceStep() {
    if (!nextStepDef) return;
    setBusy(true);
    try {
      const updated = await updateAudienceMember(member.id, { current_step: nextStepDef.step_index });
      await logAudienceEvent({
        audience_member_id: member.id,
        funnel_step_id: nextStepDef.id,
        event_type: 'step_started',
        data: { step_index: nextStepDef.step_index, manual: true },
      });
      await onChanged(updated);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(newStatus: MemberStatus) {
    setBusy(true);
    try {
      const patch: Partial<AudienceMember> = { status: newStatus };
      if (newStatus === 'konverterad') {
        patch.converted_at = new Date().toISOString();
      }
      const updated = await updateAudienceMember(member.id, patch);
      await logAudienceEvent({
        audience_member_id: member.id,
        event_type: newStatus === 'konverterad' ? 'converted' : 'manual_note',
        data: { status: newStatus, manual: true },
      });
      await onChanged(updated);
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await logAudienceEvent({
        audience_member_id: member.id,
        event_type: 'manual_note',
        data: { note: note.trim() },
      });
      setNote('');
      const updatedEvents = await listAudienceEvents(member.id);
      setEvents(updatedEvents);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="badge badge-blue">{KIND_LABEL[member.kind]}</span>
          <span className={'badge ' + STATUS_BADGE[member.status]}>{STATUS_LABEL[member.status]}</span>
          <span className="badge badge-gray">Steg {member.current_step}</span>
        </div>
        <h2 style={{ margin: '6px 0' }}>{member.full_name || member.email}</h2>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12 }}>
          {member.email} · Tillagd {new Date(member.joined_funnel_at).toLocaleString('sv-SE', { dateStyle: 'short' })}
          {member.source && ` · Källa: ${member.source}`}
          {member.mailerlite_subscriber_id && ` · MailerLite #${member.mailerlite_subscriber_id}`}
        </div>

        {/* Tunnel-progress */}
        {steps.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: 8 }}>
              Tunnel-progress
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {steps.map((s) => {
                const isCurrent = s.step_index === member.current_step;
                const isPast = s.step_index < member.current_step;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 6,
                      borderRadius: 6,
                      background: isCurrent ? 'var(--mint, #d8f5ec)' : 'transparent',
                      opacity: isPast ? 0.5 : 1,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                      {isPast ? '✓' : isCurrent ? '●' : s.step_index}
                    </span>
                    <span>{STEP_TYPE_ICON[s.type]}</span>
                    <span style={{ flex: 1, fontWeight: isCurrent ? 700 : 400 }}>{s.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                      Dag {s.delay_days}
                    </span>
                  </div>
                );
              })}
            </div>
            {currentStepDef && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
                <strong>Nu:</strong> {STEP_TYPE_LABEL[currentStepDef.type]} — {currentStepDef.description ?? currentStepDef.title}
              </div>
            )}
          </div>
        )}

        {/* Anteckningar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: 6 }}>
            Lägg till anteckning
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="persona-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="t.ex. ringt och pratat, vill se mer fastighet"
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNote();
              }}
            />
            <button className="btn-secondary" onClick={addNote} disabled={busy || !note.trim()}>
              Spara
            </button>
          </div>
        </div>

        {/* Event-historik */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: 6 }}>
            Händelser ({events.length})
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {events.length === 0 ? (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--muted-foreground)' }}>Inga händelser än.</div>
            ) : (
              events.map((e) => (
                <div key={e.id} style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>{e.event_type}</span>
                  <span style={{ float: 'right', color: 'var(--muted-foreground)' }}>
                    {new Date(e.occurred_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  {e.data && (
                    <div style={{ marginTop: 2, fontFamily: 'ui-monospace, monospace', color: 'var(--muted-foreground)' }}>
                      {JSON.stringify(e.data)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {member.status === 'aktiv' && (
            <>
              <button className="btn-secondary" onClick={() => changeStatus('pausad')} disabled={busy}>
                ⏸ Pausa
              </button>
              <button className="btn-secondary" onClick={() => changeStatus('konverterad')} disabled={busy}>
                ✅ Markera konverterad
              </button>
              {nextStepDef && (
                <button className="btn-primary" onClick={advanceStep} disabled={busy}>
                  ▶ Avancera till steg {nextStepDef.step_index} ({nextStepDef.title})
                </button>
              )}
            </>
          )}
          {member.status === 'pausad' && (
            <button className="btn-primary" onClick={() => changeStatus('aktiv')} disabled={busy}>
              ▶ Återaktivera
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
