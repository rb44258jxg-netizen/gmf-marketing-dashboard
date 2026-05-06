import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { hasSupabaseConfig } from './lib/supabase';
import Login from './pages/Login';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Knowledge from './pages/Knowledge';
import Content from './pages/Content';
import ChannelsHub from './pages/ChannelsHub';
import Chat from './pages/Chat';
import Cases from './pages/Cases';
import Calendar from './pages/Calendar';
import Insights from './pages/Insights';
import Funnels from './pages/Funnels';
import { FUNNELS_ENABLED } from './lib/featureFlags';

export default function App() {
  const { session, loading } = useAuth();

  if (!hasSupabaseConfig) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-card-logo">
            <img src="/logo-deep-teal.png" alt="GreenMerc" />
          </div>
          <h1>Supabase saknas</h1>
          <p>
            Kopiera <code>.env.example</code> till <code>.env</code> och fyll i{' '}
            <code>VITE_SUPABASE_URL</code> och <code>VITE_SUPABASE_ANON_KEY</code>.
            Starta sedan om dev-servern.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar session…
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/personas" element={<Navigate to="/knowledge?view=personas" replace />} />
        <Route path="/competitors" element={<Navigate to="/knowledge?view=competitors" replace />} />
        <Route path="/content" element={<Content />} />

        {/* Plan — kalender + (Sprint A) marknadsaktiviteter */}
        <Route path="/plan" element={<Calendar />} />
        <Route path="/calendar" element={<Navigate to="/plan" replace />} />

        {/* Kanaler-hub: Sociala medier + E-post + Integrationsstatus */}
        <Route path="/channels" element={<ChannelsHub />} />
        <Route path="/email" element={<Navigate to="/channels?view=email" replace />} />
        <Route path="/social" element={<Navigate to="/channels?view=social" replace />} />

        <Route path="/chat" element={<Chat />} />
        <Route path="/cases" element={<Cases />} />
        <Route
          path="/funnels"
          element={FUNNELS_ENABLED ? <Funnels /> : <Navigate to="/" replace />}
        />

        {/* Insikter-hub: Analytics + Briefing + Körningar + Audit */}
        <Route path="/insights" element={<Insights />} />
        <Route path="/analytics" element={<Navigate to="/insights?view=analytics" replace />} />
        <Route path="/briefing" element={<Navigate to="/insights?view=briefing" replace />} />
        <Route path="/runs" element={<Navigate to="/insights?view=runs" replace />} />
        <Route path="/audit" element={<Navigate to="/insights?view=audit" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
