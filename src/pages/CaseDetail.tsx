import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteCase,
  deleteDocument,
  extractCompanyFacts,
  generateMarketingPlan,
  getCase,
  getDocumentSignedUrl,
  listDocuments,
  STATUS_LABEL,
  updateCase,
  uploadDocument,
  type Case,
  type CaseDocument,
  type CompanyFacts,
  type MarketingPlan,
} from '../lib/cases';
import { logAudit } from '../lib/audit';
import { supabase } from '../lib/supabase';
import AskBot from '../components/AskBot';

export default function CaseDetail({ caseId }: { caseId: string }) {
  const [c, setC] = useState<Case | null | undefined>(undefined);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [extractElapsed, setExtractElapsed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Case>>({});
  const [contentCount, setContentCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const extractPollRef = useRef<number | null>(null);
  const pendingKey = `case-plan-pending-${caseId}`;
  const extractKey = `case-extract-pending-${caseId}`;

  async function load() {
    try {
      const cs = await getCase(caseId);
      setC(cs);
      if (cs) {
        const [d, count] = await Promise.all([
          listDocuments(caseId),
          supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('case_id', caseId),
        ]);
        setDocs(d);
        setContentCount(count.count ?? 0);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // Vid mount: om vi har sparat "generering pågår" i localStorage, återuppta polling
    const pending = localStorage.getItem(pendingKey);
    if (pending) {
      const startedAt = parseInt(pending, 10);
      const ageSec = (Date.now() - startedAt) / 1000;
      if (ageSec < 120) {
        setGenerating(true);
        startPolling(startedAt);
      } else {
        localStorage.removeItem(pendingKey);
      }
    }

    // Återuppta extract-polling om vi har en pågående
    const extractPending = localStorage.getItem(extractKey);
    if (extractPending) {
      const startedAt = parseInt(extractPending, 10);
      const ageSec = (Date.now() - startedAt) / 1000;
      if (ageSec < 120) {
        setExtracting(true);
        startExtractPolling(startedAt);
      } else {
        localStorage.removeItem(extractKey);
      }
    }

    // Vid window focus — refresha case (om plan klart i bakgrunden)
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (extractPollRef.current) window.clearInterval(extractPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  function startPolling(startedAt: number) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setGenElapsed(Math.floor((Date.now() - startedAt) / 1000));
    pollRef.current = window.setInterval(async () => {
      const ageSec = (Date.now() - startedAt) / 1000;
      setGenElapsed(Math.floor(ageSec));
      try {
        const fresh = await getCase(caseId);
        if (fresh?.plan_generated_at && (!c?.plan_generated_at || fresh.plan_generated_at !== c.plan_generated_at)) {
          setC(fresh);
          setGenerating(false);
          localStorage.removeItem(pendingKey);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          await logAudit({
            action: 'case.plan.generate',
            entity_type: 'case',
            entity_id: caseId,
            before: null,
            after: { plan_summary: fresh.marketing_plan?.summary ?? '' },
          });
        }
      } catch {
        // ignorera transient
      }
      if (ageSec > 110) {
        setGenerating(false);
        setError('Planen tog för lång tid att generera. Prova igen — eller ladda upp färre/mindre dokument.');
        localStorage.removeItem(pendingKey);
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 2000);
  }

  function startExtractPolling(startedAt: number) {
    if (extractPollRef.current) window.clearInterval(extractPollRef.current);
    setExtractElapsed(Math.floor((Date.now() - startedAt) / 1000));
    extractPollRef.current = window.setInterval(async () => {
      const ageSec = (Date.now() - startedAt) / 1000;
      setExtractElapsed(Math.floor(ageSec));
      try {
        const fresh = await getCase(caseId);
        if (
          fresh?.facts_extracted_at &&
          (!c?.facts_extracted_at || fresh.facts_extracted_at !== c.facts_extracted_at)
        ) {
          setC(fresh);
          setExtracting(false);
          localStorage.removeItem(extractKey);
          if (extractPollRef.current) {
            window.clearInterval(extractPollRef.current);
            extractPollRef.current = null;
          }
          await logAudit({
            action: 'case.facts.extract',
            entity_type: 'case',
            entity_id: caseId,
            before: null,
            after: { extracted_at: fresh.facts_extracted_at },
          });
        }
      } catch {
        // ignorera
      }
      if (ageSec > 110) {
        setExtracting(false);
        setError('Dokumentanalysen tog för lång tid. Prova igen, eller ladda upp ett mindre dokument.');
        localStorage.removeItem(extractKey);
        if (extractPollRef.current) {
          window.clearInterval(extractPollRef.current);
          extractPollRef.current = null;
        }
      }
    }, 2000);
  }

  if (c === undefined) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar case…
      </div>
    );
  }
  if (c === null) {
    return (
      <div className="card empty-state">
        <strong>Case hittades inte</strong>
        <Link to="/cases">← Tillbaka till listan</Link>
      </div>
    );
  }

  const sb = STATUS_LABEL[c.status];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await uploadDocument(caseId, file);
      await logAudit({
        action: 'case.document.upload',
        entity_type: 'case_document',
        entity_id: doc.id,
        before: null,
        after: { case_id: caseId, file_name: file.name, file_size: file.size },
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteDoc(d: CaseDocument) {
    if (!confirm(`Radera "${d.file_name}"?`)) return;
    try {
      await deleteDocument(d);
      await logAudit({
        action: 'case.document.delete',
        entity_type: 'case_document',
        entity_id: d.id,
        before: d,
        after: null,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleViewDoc(d: CaseDocument) {
    try {
      const url = await getDocumentSignedUrl(d.file_path);
      window.open(url, '_blank');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleGeneratePlan() {
    setGenerating(true);
    setError(null);
    const startedAt = Date.now();
    localStorage.setItem(pendingKey, String(startedAt));
    startPolling(startedAt);

    generateMarketingPlan(caseId).then((result) => {
      if (result && 'error' in result) {
        setError(result.error);
        setGenerating(false);
        localStorage.removeItem(pendingKey);
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (result) {
        load();
      }
    });
  }

  async function handleExtractFacts() {
    setExtracting(true);
    setError(null);
    const startedAt = Date.now();
    localStorage.setItem(extractKey, String(startedAt));
    startExtractPolling(startedAt);

    extractCompanyFacts(caseId).then((result) => {
      if (result && 'error' in result) {
        setError('Extrahering: ' + result.error);
        setExtracting(false);
        localStorage.removeItem(extractKey);
        if (extractPollRef.current) {
          window.clearInterval(extractPollRef.current);
          extractPollRef.current = null;
        }
      } else if (result) {
        load();
      }
    });
  }

  async function startEdit() {
    setDraft(c!);
    setEditing(true);
  }

  async function saveEdit() {
    try {
      const before = c;
      const updated = await updateCase(caseId, draft);
      await logAudit({
        action: 'case.update',
        entity_type: 'case',
        entity_id: caseId,
        before,
        after: updated,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteCase() {
    if (!confirm(`Radera "${c!.name}"? Alla länkade dokument försvinner. Kan inte ångras.`)) return;
    try {
      await deleteCase(caseId);
      await logAudit({
        action: 'case.delete',
        entity_type: 'case',
        entity_id: caseId,
        before: c,
        after: null,
      });
      window.location.href = '/cases';
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Link to="/cases" className="header-link">
          ← Alla cases
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && (
            <button className="btn-secondary" onClick={startEdit}>
              Redigera
            </button>
          )}
          <button className="btn-danger" onClick={handleDeleteCase}>
            Radera case
          </button>
        </div>
      </div>

      <div className="card card-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="card-hero-title">{c.name}</div>
            <div className="card-hero-sub">
              {c.sector || 'Sektor ej angiven'} · <span className={'badge ' + sb.cls}>{sb.label}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot
            botSlug="marketing-strategist"
            label="Diskutera detta case"
            variant="on-dark"
            prefill={`Case: ${c.name} (${c.sector}). ${c.description}\n\nSökt belopp: ${c.target_amount_sek ? (c.target_amount_sek / 1_000_000).toFixed(1) + ' MSEK' : 'okänt'}. Stänger: ${c.emission_close ?? 'ej satt'}.\n\nVad ska vi prioritera närmsta veckorna?`}
          />
          <AskBot
            botSlug="content-writer"
            label="Skriv för detta case"
            variant="on-dark"
            prefill={`Skriv ett kort innehåll om caset "${c.name}" (${c.sector}). ${c.description}. Föreslå 3 alternativ — t.ex. ett LinkedIn-inlägg, en e-post-rubrik och en blogg-hook.`}
          />
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {editing && (
        <div className="card">
          <div className="card-title">Redigera case</div>
          <label className="persona-input-label">Namn</label>
          <input
            className="persona-input"
            value={draft.name ?? ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label className="persona-input-label">Sektor</label>
          <input
            className="persona-input"
            value={draft.sector ?? ''}
            onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
          />
          <label className="persona-input-label">Beskrivning</label>
          <textarea
            className="persona-input"
            rows={3}
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="persona-input-label">Sökt belopp (SEK)</label>
              <input
                className="persona-input"
                type="number"
                value={draft.target_amount_sek ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, target_amount_sek: e.target.value ? parseInt(e.target.value, 10) : null })
                }
              />
            </div>
            <div>
              <label className="persona-input-label">Status</label>
              <select
                className="persona-input"
                value={draft.status ?? 'prospect'}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Case['status'] })}
              >
                {(Object.keys(STATUS_LABEL) as Case['status'][]).map((s) => (
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
                value={draft.emission_open ?? ''}
                onChange={(e) => setDraft({ ...draft, emission_open: e.target.value || null })}
              />
            </div>
            <div>
              <label className="persona-input-label">Emission stänger</label>
              <input
                className="persona-input"
                type="date"
                value={draft.emission_close ?? ''}
                onChange={(e) => setDraft({ ...draft, emission_close: e.target.value || null })}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setEditing(false)}>
              Avbryt
            </button>
            <button className="btn-primary" onClick={saveEdit}>
              Spara
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div>
          <div className="card">
            <div className="card-title">
              Dokument
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                + Ladda upp
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg"
            />
            {docs.length === 0 ? (
              <div className="empty-state">
                <strong>Inga dokument än</strong>
                Ladda upp pitch deck, IFB, financials etc. så kan AI:n läsa dem och generera en bättre marknadsplan.
              </div>
            ) : (
              <div>
                {docs.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--mint)',
                        color: 'var(--deep-teal)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                      }}
                    >
                      📄
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.file_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                        {d.file_size ? `${(d.file_size / 1024).toFixed(0)} kB` : ''} · {new Date(d.uploaded_at).toLocaleDateString('sv-SE')}
                      </div>
                    </div>
                    <button className="content-action-btn" onClick={() => handleViewDoc(d)}>
                      Öppna
                    </button>
                    <button className="content-action-btn" onClick={() => handleDeleteDoc(d)}>
                      Radera
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Bolagsfakta
              <button
                className="btn-primary"
                onClick={handleExtractFacts}
                disabled={extracting || docs.filter((d) => (d.file_type ?? '').includes('pdf')).length === 0}
                title="AI läser uppladdat pitch deck och extraherar bolagsfakta"
              >
                {extracting
                  ? 'Analyserar…'
                  : c.extracted_facts
                  ? '🔄 Analysera om'
                  : '📄 Analysera dokument'}
              </button>
            </div>
            {extracting && (
              <ProgressBar elapsed={extractElapsed} estimate={45} label="AI läser ditt pitch deck…" />
            )}
            {!c.extracted_facts && !extracting ? (
              <div className="empty-state">
                <strong>Inga bolagsfakta extraherade än</strong>
                Ladda upp ett pitch deck (PDF) och klicka "Analysera dokument" — AI läser och fyller i bolagsbeskrivning, team, marknad, traction, financials med mera.
              </div>
            ) : c.extracted_facts ? (
              <FactsView facts={c.extracted_facts} extractedAt={c.facts_extracted_at} />
            ) : null}
          </div>

          <div className="card">
            <div className="card-title">
              Marknadsplan
              <button
                className="btn-primary"
                onClick={handleGeneratePlan}
                disabled={generating}
                title="AI genererar/uppdaterar marknadsplanen"
              >
                {generating ? 'Genererar…' : c.marketing_plan ? '🔄 Generera om' : '✨ Generera plan'}
              </button>
            </div>
            {generating && (
              <ProgressBar
                elapsed={genElapsed}
                estimate={45}
                label={
                  c.extracted_facts
                    ? 'Marketing Strategist använder bolagsfakta för att skriva planen…'
                    : 'Marketing Strategist skriver planen…'
                }
              />
            )}
            {!c.marketing_plan && !generating ? (
              <div className="empty-state">
                <strong>Ingen plan genererad än</strong>
                Klicka "Generera plan" — Marketing Strategist producerar en strukturerad tidsplan baserat på case-info{c.extracted_facts ? ' och extraherade bolagsfakta' : ' och dokument'}.
              </div>
            ) : c.marketing_plan ? (
              <PlanView plan={c.marketing_plan} planGeneratedAt={c.plan_generated_at} />
            ) : null}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Info</div>
            <Info label="Sökt belopp" value={c.target_amount_sek ? `${(c.target_amount_sek / 1_000_000).toFixed(1)} MSEK` : '—'} />
            <Info label="Emission öppnar" value={c.emission_open ?? '—'} />
            <Info label="Emission stänger" value={c.emission_close ?? '—'} />
            <Info label="Kontakt" value={c.contact_name ?? '—'} />
            <Info label="E-post" value={c.contact_email ?? '—'} />
          </div>

          <div className="card">
            <div className="card-title">Kopplat innehåll</div>
            <div style={{ fontSize: 13 }}>
              {contentCount === 0
                ? 'Inget innehåll kopplat ännu.'
                : `${contentCount} content-item${contentCount === 1 ? '' : 's'} länkat till detta case.`}
            </div>
            <div style={{ marginTop: 10 }}>
              <Link to={`/content?case=${caseId}`} className="header-link">
                Se i Content Library →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function ProgressBar({ elapsed, estimate, label }: { elapsed: number; estimate: number; label: string }) {
  const pct = Math.min(95, (elapsed / estimate) * 100);
  return (
    <div style={{ marginBottom: 14, padding: 12, background: 'var(--mint)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep-teal)' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
          {elapsed} sek
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'rgba(29,135,117,0.15)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--primary), var(--deep-teal))',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 6 }}>
        Du kan navigera bort — det fortsätter i bakgrunden. Resultatet hämtas automatiskt.
      </div>
    </div>
  );
}

function FactsView({ facts, extractedAt }: { facts: CompanyFacts; extractedAt: string | null }) {
  if (facts.parse_error) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 8 }}>
          AI-svaret kunde inte parsas som JSON. Råtext:
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          {facts.raw_text ?? JSON.stringify(facts, null, 2)}
        </div>
      </div>
    );
  }
  return (
    <div>
      {extractedAt && (
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 12 }}>
          Extraherad {new Date(extractedAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
        </div>
      )}
      {facts.bolagsbeskrivning && <FactRow label="Bolagsbeskrivning" value={facts.bolagsbeskrivning} />}
      {facts.usp && <FactRow label="USP" value={facts.usp} highlight />}
      {facts.problem && <FactRow label="Problem" value={facts.problem} />}
      {facts.lösning && <FactRow label="Lösning" value={facts.lösning} />}
      {facts.marknad && (
        <div style={{ marginBottom: 12 }}>
          <div className="persona-section-label">Marknad</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {facts.marknad.storlek && <MiniBox label="Storlek" value={facts.marknad.storlek} />}
            {facts.marknad.tillväxt && <MiniBox label="Tillväxt" value={facts.marknad.tillväxt} />}
            {facts.marknad.kunder && <MiniBox label="Kunder" value={facts.marknad.kunder} />}
          </div>
        </div>
      )}
      {facts.traction && facts.traction.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="persona-section-label">Traction</div>
          <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {facts.traction.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {facts.team && facts.team.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="persona-section-label">Team</div>
          {facts.team.map((m, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{m.namn ?? '—'}</strong>
              {m.roll && <span style={{ color: 'var(--muted-foreground)' }}> · {m.roll}</span>}
              {m.bakgrund && <span style={{ color: 'var(--muted-foreground)' }}> — {m.bakgrund}</span>}
            </div>
          ))}
        </div>
      )}
      {facts.financials && (
        <div style={{ marginBottom: 12 }}>
          <div className="persona-section-label">Financials</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {facts.financials.intäkter_idag && <MiniBox label="Intäkter idag" value={facts.financials.intäkter_idag} />}
            {facts.financials.prognos && <MiniBox label="Prognos" value={facts.financials.prognos} />}
            {facts.financials.användning_av_kapital && (
              <MiniBox label="Användning av kapital" value={facts.financials.användning_av_kapital} />
            )}
          </div>
        </div>
      )}
      {facts.exit_strategi && <FactRow label="Exit-strategi" value={facts.exit_strategi} />}
      {facts.risker && facts.risker.length > 0 && (
        <div
          style={{
            padding: 10,
            background: 'var(--yellow-bg)',
            borderRadius: 'var(--radius-sm)',
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a6411', textTransform: 'uppercase', marginBottom: 6 }}>
            Risker
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {facts.risker.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FactRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="persona-section-label">{label}</div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: highlight ? 'var(--deep-teal)' : 'var(--foreground)',
          fontWeight: highlight ? 600 : 400,
          fontStyle: highlight ? 'italic' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 10,
        background: 'var(--soft-cloud)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

function PlanView({ plan, planGeneratedAt }: { plan: MarketingPlan; planGeneratedAt: string | null }) {
  if (plan.parse_error || !plan.phases) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 8 }}>
          AI-svaret kunde inte parsas som strukturerad plan. Råtext nedan:
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          {plan.raw_text ?? JSON.stringify(plan, null, 2)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {planGeneratedAt && (
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 12 }}>
          Genererad {new Date(planGeneratedAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
        </div>
      )}

      {plan.summary && (
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--mint)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--deep-teal)', textTransform: 'uppercase', marginBottom: 4 }}>
            Strategi
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{plan.summary}</div>
          {plan.key_message && (
            <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic', color: 'var(--deep-teal)' }}>
              "{plan.key_message}"
            </div>
          )}
        </div>
      )}

      {plan.primary_persona && (
        <div style={{ marginBottom: 12 }}>
          <span className="badge badge-blue">Primär persona: {plan.primary_persona}</span>
          {plan.channels_priority && (
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted-foreground)' }}>
              Kanaler: {plan.channels_priority.join(' → ')}
            </span>
          )}
        </div>
      )}

      {plan.phases.map((phase, i) => (
        <div
          key={i}
          style={{
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--deep-teal)' }}>{phase.name}</div>
            {phase.starts_days_before_close !== undefined && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                T-{phase.starts_days_before_close}
                {phase.ends_days_before_close !== undefined ? ` till T-${phase.ends_days_before_close}` : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>{phase.objective}</div>
          {phase.content_items && phase.content_items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {phase.content_items.map((item, j) => (
                <div
                  key={j}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--soft-cloud)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {item.title}
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
                      {item.type} · {item.channel}
                    </span>
                  </div>
                  <div style={{ marginTop: 2, color: 'var(--muted-foreground)' }}>{item.description}</div>
                  {item.kpi && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--deep-teal)' }}>📊 {item.kpi}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {plan.risks && plan.risks.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--yellow-bg)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a6411', textTransform: 'uppercase', marginBottom: 6 }}>
            Risker
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {plan.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.success_metrics && plan.success_metrics.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0d6e54', textTransform: 'uppercase', marginBottom: 6 }}>
            Framgångskriterier
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {plan.success_metrics.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
