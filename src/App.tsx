import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { hasSupabaseConfig } from './lib/supabase';
import Login from './pages/Login';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Personas from './pages/Personas';
import Content from './pages/Content';
import Competitors from './pages/Competitors';
import Email from './pages/Email';
import Social from './pages/Social';
import Channels from './pages/Channels';
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
        <Route path="/personas" element={<Personas />} />
        <Route path="/content" element={<Content />} />
        <Route path="/competitors" element={<Competitors />} />
        <Route path="/email" element={<Email />} />
        <Route path="/social" element={<Social />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
