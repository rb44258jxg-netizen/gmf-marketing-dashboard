import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import type { PersonaRow, PersonaUpdate } from '../lib/database.types';
import AskBot from '../components/AskBot';

interface EditState {
  name: string;
  age: string;
  title: string;
  role: string;
  portfolio: string;
  investment: string;
  behavior: string;
  triggers: string;
  objection: string;
  channels: string;
}

function rowToEdit(p: PersonaRow): EditState {
  return {
    name: p.name,
    age: String(p.age),
    title: p.title,
    role: p.role,
    portfolio: p.portfolio,
    investment: p.investment,
    behavior: p.behavior,
    triggers: p.triggers,
    objection: p.objection,
    channels: p.channels.join(', '),
  };
}

export default function Personas() {
  const [rows, setRows] = useState<PersonaRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('personas')
      .select('*')
      .order('sort_order', { ascending: true });
    if (err) setError(err.message);
    else setRows(data as PersonaRow[]);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(p: PersonaRow) {
    setEditingId(p.id);
    setDraft(rowToEdit(p));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(p: PersonaRow) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const ageNum = parseInt(draft.age, 10);
    const update: PersonaUpdate = {
      name: draft.name.trim(),
      age: Number.isFinite(ageNum) ? ageNum : p.age,
      title: draft.title.trim(),
      role: draft.role.trim(),
      portfolio: draft.portfolio.trim(),
      investment: draft.investment.trim(),
      behavior: draft.behavior.trim(),
      triggers: draft.triggers.trim(),
      objection: draft.objection.trim(),
      channels: draft.channels.split(',').map((s) => s.trim()).filter(Boolean),
    };
    const before = { ...p };
    const { data, error: err } = await supabase
      .from('personas')
      .update(update)
      .eq('id', p.id)
      .select()
      .single();
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await logAudit({
      action: 'persona.update',
      entity_type: 'persona',
      entity_id: p.id,
      before,
      after: data,
    });
    setEditingId(null);
    setDraft(null);
    await load();
  }

  if (rows === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar personas…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Målgruppsprofiler</div>
        <div className="card-hero-sub">
          Redigera personas direkt — ändringar sparas i Supabase och loggas i audit.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot botSlug="marketing-strategist" label="Fråga om personas" />
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="persona-grid">
        {rows.map((p) => {
          const editing = editingId === p.id && draft;
          return (
            <div key={p.id} className={'persona-card' + (editing ? ' editing' : '')}>
              {!editing && (
                <button
                  className="persona-edit-btn"
                  onClick={() => startEdit(p)}
                  title="Redigera"
                  aria-label={`Redigera ${p.name}`}
                >
                  ✎
                </button>
              )}

              {!editing && (
                <>
                  <div className="persona-header">
                    <div className="persona-avatar" style={{ background: p.avatar_bg }}>
                      {p.avatar_letter}
                    </div>
                    <div>
                      <div className="persona-name">
                        {p.name}, {p.age}
                      </div>
                      <div className="persona-title">"{p.title}"</div>
                    </div>
                  </div>
                  {p.badge && (
                    <div style={{ marginBottom: 10 }}>
                      <span className={'badge ' + p.badge_class}>{p.badge}</span>
                    </div>
                  )}
                  <Section label="Roll" text={p.role} />
                  <Section label="Portfölj" text={p.portfolio} />
                  <Section label="Investering" text={p.investment} />
                  <Section label="Beteende" text={p.behavior} />
                  <Section label="Triggers" text={p.triggers} />
                  <div className="persona-section">
                    <div className="persona-section-label">Invändning</div>
                    <div
                      className="persona-section-text"
                      style={{ fontStyle: 'italic', color: 'var(--destructive)' }}
                    >
                      {p.objection}
                    </div>
                  </div>
                  <div className="persona-section">
                    <div className="persona-section-label">Kanaler</div>
                    <div className="persona-tags">
                      {p.channels.map((c) => (
                        <span key={c} className="persona-tag">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {editing && draft && (
                <div>
                  <label className="persona-input-label">Namn</label>
                  <input
                    className="persona-input"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <label className="persona-input-label">Ålder</label>
                  <input
                    className="persona-input"
                    type="number"
                    value={draft.age}
                    onChange={(e) => setDraft({ ...draft, age: e.target.value })}
                  />
                  <label className="persona-input-label">Titel</label>
                  <input
                    className="persona-input"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                  <label className="persona-input-label">Roll</label>
                  <input
                    className="persona-input"
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  />
                  <label className="persona-input-label">Portfölj</label>
                  <textarea
                    className="persona-input"
                    rows={2}
                    value={draft.portfolio}
                    onChange={(e) => setDraft({ ...draft, portfolio: e.target.value })}
                  />
                  <label className="persona-input-label">Investering</label>
                  <input
                    className="persona-input"
                    value={draft.investment}
                    onChange={(e) => setDraft({ ...draft, investment: e.target.value })}
                  />
                  <label className="persona-input-label">Beteende</label>
                  <textarea
                    className="persona-input"
                    rows={2}
                    value={draft.behavior}
                    onChange={(e) => setDraft({ ...draft, behavior: e.target.value })}
                  />
                  <label className="persona-input-label">Triggers</label>
                  <textarea
                    className="persona-input"
                    rows={2}
                    value={draft.triggers}
                    onChange={(e) => setDraft({ ...draft, triggers: e.target.value })}
                  />
                  <label className="persona-input-label">Invändning</label>
                  <input
                    className="persona-input"
                    value={draft.objection}
                    onChange={(e) => setDraft({ ...draft, objection: e.target.value })}
                  />
                  <label className="persona-input-label">Kanaler (komma-separerade)</label>
                  <input
                    className="persona-input"
                    value={draft.channels}
                    onChange={(e) => setDraft({ ...draft, channels: e.target.value })}
                  />
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button className="btn-primary" disabled={saving} onClick={() => saveEdit(p)}>
                      {saving ? 'Sparar…' : 'Spara'}
                    </button>
                    <button className="btn-secondary" disabled={saving} onClick={cancelEdit}>
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="persona-section">
      <div className="persona-section-label">{label}</div>
      <div className="persona-section-text">{text}</div>
    </div>
  );
}
