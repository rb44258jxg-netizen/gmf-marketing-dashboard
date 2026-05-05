import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface BriefingRow {
  id: string;
  generated_for_week_starting: string;
  title: string;
  body: string;
  bot_slug: string;
  created_at: string;
}

export default function Briefing() {
  const [latest, setLatest] = useState<BriefingRow | null | undefined>(undefined);
  const [history, setHistory] = useState<BriefingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('briefings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (err) {
        setError(err.message);
        return;
      }
      const list = (data as BriefingRow[]) ?? [];
      setLatest(list[0] ?? null);
      setHistory(list.slice(1));
    }
    load();
  }, []);

  if (latest === undefined) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar briefing…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Veckobriefing</div>
        <div className="card-hero-sub">
          Sammanställ veckans läge — pipeline, e-post, prioriteringar — och spara här så hela teamet kan läsa.
          {/* TODO Step 2: knapp "Lägg till veckobriefing" som öppnar paste-form */}
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {!latest ? (
        <div className="card empty-state">
          <strong>Ingen briefing än</strong>
          Skriv veckobriefingen i Claude Code (eller var du nu föredrar) och paste:a in den här
          via "Lägg till veckobriefing"-formuläret (kommer i nästa steg).
        </div>
      ) : (
        <div className="card">
          <div className="card-title">
            {latest.title}
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}>
              Genererad {new Date(latest.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
            }}
          >
            {latest.body}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="card-title">Tidigare briefingar</div>
          {history.map((b) => (
            <details key={b.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {b.title}
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 8, fontWeight: 500 }}>
                  {new Date(b.created_at).toLocaleDateString('sv-SE')}
                </span>
              </summary>
              <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 10, paddingLeft: 12 }}>
                {b.body}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
