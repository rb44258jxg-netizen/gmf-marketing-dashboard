import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { hasSupabaseConfig } from './lib/supabase';
import Login from './pages/Login';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Knowledge from './pages/Knowledge';
import Content from './pages/Content';
import Email from './pages/Email';
import Social from './pages/Social';
import Channels from './pages/Channels';
import Chat from './pages/Chat';
import Briefing from './pages/Briefing';
import Cases from './pages/Cases';
import Calendar from './pages/Calendar';
import Analytics from './pages/Analytics';
import Audit from './pages/Audit';

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
        <Route path="/email" element={<Email />} />
        <Route path="/social" element={<Social />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
