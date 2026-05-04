import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Overview() {
  const [counts, setCounts] = useState({ personas: 0, content: 0, drafts: 0, ready: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ count: personas }, { count: content }, { count: drafts }, { count: ready }] = await Promise.all([
        supabase.from('personas').select('*', { count: 'exact', head: true }),
        supabase.from('content_items').select('*', { count: 'exact', head: true }),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('status', 'utkast'),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('status', 'redo'),
      ]);
      setCounts({
        personas: personas ?? 0,
        content: content ?? 0,
        drafts: drafts ?? 0,
        ready: ready ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Välkommen till GMF Marknadsteam</div>
        <div className="card-hero-sub">
          Personas, content library och audit — allt sparas live i Supabase och delas av hela teamet.
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi highlight">
          <div className="kpi-label">Personas</div>
          <div className="kpi-value">{loading ? '—' : counts.personas}</div>
          <div className="kpi-sub">målgruppsprofiler</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Innehåll totalt</div>
          <div className="kpi-value">{loading ? '—' : counts.content}</div>
          <div className="kpi-sub">i biblioteket</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Utkast</div>
          <div className="kpi-value">{loading ? '—' : counts.drafts}</div>
          <div className="kpi-sub">behöver färdigställas</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Redo att publicera</div>
          <div className="kpi-value">{loading ? '—' : counts.ready}</div>
          <div className="kpi-sub">i kön</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Snabbåtgärder</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <Link to="/personas" className="header-link" style={{ justifyContent: 'space-between' }}>
            <span>Redigera personas →</span>
          </Link>
          <Link to="/content" className="header-link" style={{ justifyContent: 'space-between' }}>
            <span>Hantera content library →</span>
          </Link>
          <Link to="/audit" className="header-link" style={{ justifyContent: 'space-between' }}>
            <span>Visa audit-logg →</span>
          </Link>
        </div>
      </div>
    </>
  );
}
