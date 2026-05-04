import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import AskBot from '../components/AskBot';

interface Competitor {
  id: string;
  slug: string;
  name: string;
  country: string;
  channels: string;
  what_they_do: string;
  budget: string;
  message: string;
  meta_ads_count: number | null;
  meta_platform: string | null;
  meta_what: string | null;
  sort_order: number;
}

interface Top10 {
  id: string;
  rank: number;
  text: string;
  source: string;
}

export default function Competitors() {
  const [comps, setComps] = useState<Competitor[] | null>(null);
  const [top10, setTop10] = useState<Top10[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Competitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, t] = await Promise.all([
      supabase.from('competitors').select('*').order('sort_order'),
      supabase.from('top10_picks').select('*').order('rank'),
    ]);
    if (c.error) setError(c.error.message);
    else setComps(c.data as Competitor[]);
    if (t.error) setError(t.error.message);
    else setTop10(t.data as Top10[]);
  }

  useEffect(() => {
    load();
  }, []);

  const metaAds = useMemo(
    () => (comps ?? []).filter((c) => c.meta_ads_count !== null),
    [comps],
  );

  function startEdit(c: Competitor) {
    setEditing(c.id);
    setDraft({ ...c });
    setError(null);
  }

  function cancel() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const before = comps?.find((c) => c.id === draft.id);
    const update = {
      name: draft.name,
      country: draft.country,
      channels: draft.channels,
      what_they_do: draft.what_they_do,
      budget: draft.budget,
      message: draft.message,
      meta_ads_count: draft.meta_ads_count,
      meta_platform: draft.meta_platform,
      meta_what: draft.meta_what,
    };
    const { data, error: err } = await supabase
      .from('competitors')
      .update(update)
      .eq('id', draft.id)
      .select()
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await logAudit({
      action: 'competitor.update',
      entity_type: 'competitor',
      entity_id: draft.id,
      before,
      after: data,
    });
    cancel();
    await load();
  }

  if (comps === null || top10 === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar konkurrenter…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Steal With Pride</div>
        <div className="card-hero-sub">Det bästa från varje konkurrent — vad vi kopierar och gör bättre.</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot botSlug="marketing-strategist" label="Fråga om konkurrenter" />
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="card-title">Meta Ads — aktiva annonser just nu</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Konkurrent</th>
              <th>Aktiva annonser</th>
              <th>Plattform</th>
              <th>Vad de marknadsför</th>
            </tr>
          </thead>
          <tbody>
            {metaAds.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td style={{ fontWeight: 700, color: c.meta_ads_count! > 0 ? 'var(--deep-teal)' : 'var(--muted-foreground)' }}>
                  {c.meta_ads_count! > 0 ? `${c.meta_ads_count} st` : '0'}
                </td>
                <td>{c.meta_platform ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{c.meta_what ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {comps.map((c) => (
          <div key={c.id} className="persona-card">
            <button className="persona-edit-btn" onClick={() => startEdit(c)} title="Redigera">
              ✎
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.country}</div>
            </div>
            <Section label="VAR de marknadsför" text={c.channels} />
            <Section label="VAD de gör" text={c.what_they_do} />
            <Section label="Budget / Betalda annonser" text={c.budget} />
            <div className="persona-section">
              <div className="persona-section-label">Budskap</div>
              <div
                className="persona-section-text"
                style={{ fontStyle: 'italic', color: 'var(--deep-teal)' }}
              >
                {c.message}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Top 10 — Vad vi implementerar först</div>
        <div>
          {top10.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'var(--deep-teal)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {p.rank}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.text}</div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{p.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && draft && (
        <div className="modal-backdrop" onClick={cancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Redigera {draft.name}</h2>
            {error && <div className="auth-error">{error}</div>}
            <label className="persona-input-label">Namn</label>
            <input
              className="persona-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <label className="persona-input-label">Land</label>
            <input
              className="persona-input"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            />
            <label className="persona-input-label">Var de marknadsför</label>
            <textarea
              className="persona-input"
              rows={2}
              value={draft.channels}
              onChange={(e) => setDraft({ ...draft, channels: e.target.value })}
            />
            <label className="persona-input-label">Vad de gör</label>
            <textarea
              className="persona-input"
              rows={4}
              value={draft.what_they_do}
              onChange={(e) => setDraft({ ...draft, what_they_do: e.target.value })}
            />
            <label className="persona-input-label">Budget / Betalda annonser</label>
            <textarea
              className="persona-input"
              rows={2}
              value={draft.budget}
              onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
            />
            <label className="persona-input-label">Budskap / Tonalitet</label>
            <textarea
              className="persona-input"
              rows={2}
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            />
            <label className="persona-input-label">Meta Ads — antal aktiva (lämna tomt om okänt)</label>
            <input
              className="persona-input"
              type="number"
              value={draft.meta_ads_count ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  meta_ads_count: e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
            />
            <label className="persona-input-label">Meta Plattform</label>
            <input
              className="persona-input"
              value={draft.meta_platform ?? ''}
              onChange={(e) => setDraft({ ...draft, meta_platform: e.target.value || null })}
            />
            <label className="persona-input-label">Meta — vad de marknadsför</label>
            <input
              className="persona-input"
              value={draft.meta_what ?? ''}
              onChange={(e) => setDraft({ ...draft, meta_what: e.target.value || null })}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancel} disabled={busy}>
                Avbryt
              </button>
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Sparar…' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
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
