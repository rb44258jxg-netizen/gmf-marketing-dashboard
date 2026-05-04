import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listCases,
  STATUS_LABEL,
  type Case,
  createCase,
  type CaseStatus,
} from '../lib/cases';
import { logAudit } from '../lib/audit';
import CaseDetail from './CaseDetail';
import AskBot from '../components/AskBot';

interface DraftCase {
  slug: string;
  name: string;
  sector: string;
  description: string;
  target_amount_sek: string;
  emission_open: string;
  emission_close: string;
  status: CaseStatus;
  contact_name: string;
  contact_email: string;
}

const EMPTY: DraftCase = {
  slug: '',
  name: '',
  sector: '',
  description: '',
  target_amount_sek: '',
  emission_open: '',
  emission_close: '',
  status: 'prospect',
  contact_name: '',
  contact_email: '',
};

export default function Cases() {
  const [params] = useSearchParams();
  const detailId = params.get('id');

  if (detailId) return <CaseDetail caseId={detailId} />;
  return <CaseList />;
}

function CaseList() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<DraftCase>(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCases(await listCases());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!draft.slug.trim() || !draft.name.trim()) {
      setError('Slug och namn krävs');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCase({
        slug: draft.slug.trim().toLowerCase(),
        name: draft.name.trim(),
        sector: draft.sector.trim(),
        description: draft.description.trim(),
        target_amount_sek: draft.target_amount_sek ? parseInt(draft.target_amount_sek, 10) : undefined,
        emission_open: draft.emission_open || null,
        emission_close: draft.emission_close || null,
        status: draft.status,
        contact_name: draft.contact_name.trim() || undefined,
        contact_email: draft.contact_email.trim() || undefined,
      });
      await logAudit({
        action: 'case.create',
        entity_type: 'case',
        entity_id: created.id,
        before: null,
        after: created,
      });
      setShowCreate(false);
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (cases === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar cases…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Cases — bolag vi marknadsför</div>
        <div className="card-hero-sub">
          Onboarda nya bolag, ladda upp dokument och låt Marketing Strategist generera marknadsplan för deras emission.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot botSlug="marketing-strategist" label="Diskutera case-portfölj" variant="on-dark" />
          <button
            className="btn-primary"
            style={{ background: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.3)' }}
            onClick={() => setShowCreate(true)}
          >
            + Nytt case
          </button>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="card-title">Alla cases</div>
        {cases.length === 0 ? (
          <div className="empty-state">
            <strong>Inga cases än</strong>
            Klicka "+ Nytt case" för att lägga till första bolaget.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {cases.map((c) => {
              const sb = STATUS_LABEL[c.status];
              const days = c.emission_close ? daysUntil(c.emission_close) : null;
              return (
                <Link
                  key={c.id}
                  to={`/cases?id=${c.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 16,
                      background: 'var(--card)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      height: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(29,135,117,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--foreground)' }}>{c.name}</div>
                      <span className={'badge ' + sb.cls}>{sb.label}</span>
                    </div>
                    {c.sector && (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>{c.sector}</div>
                    )}
                    {c.description && (
                      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{c.description}</div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                      {c.target_amount_sek && (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 700 }}>
                            Sökt belopp
                          </div>
                          <div style={{ fontWeight: 600 }}>{(c.target_amount_sek / 1_000_000).toFixed(1)} MSEK</div>
                        </div>
                      )}
                      {c.emission_close && (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 700 }}>
                            Stänger
                          </div>
                          <div style={{ fontWeight: 600 }}>
                            {c.emission_close}
                            {days !== null && days >= 0 && (
                              <span style={{ marginLeft: 6, color: days <= 7 ? 'var(--destructive)' : 'var(--muted-foreground)', fontSize: 11 }}>
                                ({days} dagar kvar)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {c.marketing_plan && (
                      <div style={{ marginTop: 10 }}>
                        <span className="badge badge-purple">📋 Plan genererad</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nytt case</h2>
            {error && <div className="auth-error">{error}</div>}
            <label className="persona-input-label">Bolagsnamn</label>
            <input
              className="persona-input"
              value={draft.name}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  name: e.target.value,
                  slug: draft.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                })
              }
              autoFocus
            />
            <label className="persona-input-label">Slug (URL-vänlig identifierare)</label>
            <input
              className="persona-input"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder="t.ex. key-experience"
            />
            <label className="persona-input-label">Sektor</label>
            <input
              className="persona-input"
              value={draft.sector}
              onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
              placeholder="t.ex. Fintech, Cleantech, B2B SaaS"
            />
            <label className="persona-input-label">Beskrivning</label>
            <textarea
              className="persona-input"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="persona-input-label">Sökt belopp (SEK)</label>
                <input
                  className="persona-input"
                  type="number"
                  value={draft.target_amount_sek}
                  onChange={(e) => setDraft({ ...draft, target_amount_sek: e.target.value })}
                />
              </div>
              <div>
                <label className="persona-input-label">Status</label>
                <select
                  className="persona-input"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as CaseStatus })}
                >
                  {(Object.keys(STATUS_LABEL) as CaseStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="persona-input-label">Emission öppnar</label>
                <input
                  className="persona-input"
                  type="date"
                  value={draft.emission_open}
                  onChange={(e) => setDraft({ ...draft, emission_open: e.target.value })}
                />
              </div>
              <div>
                <label className="persona-input-label">Emission stänger</label>
                <input
                  className="persona-input"
                  type="date"
                  value={draft.emission_close}
                  onChange={(e) => setDraft({ ...draft, emission_close: e.target.value })}
                />
              </div>
              <div>
                <label className="persona-input-label">Kontakt — namn</label>
                <input
                  className="persona-input"
                  value={draft.contact_name}
                  onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })}
                />
              </div>
              <div>
                <label className="persona-input-label">Kontakt — e-post</label>
                <input
                  className="persona-input"
                  type="email"
                  value={draft.contact_email}
                  onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreate(false)} disabled={busy}>
                Avbryt
              </button>
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Skapar…' : 'Skapa case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T23:59:59Z');
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 3600 * 1000));
}
