import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) setError(err);
      } else {
        const { error: err, needsConfirmation } = await signUp(email, password);
        if (err) setError(err);
        else if (needsConfirmation) {
          setInfo('Konto skapat. Kolla din e-post för bekräftelselänk.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-logo">
          <img src="/logo-deep-teal.png" alt="GreenMerc" />
        </div>
        <h1>{mode === 'signin' ? 'Logga in' : 'Skapa konto'}</h1>
        <p>GMF Marknadsteam — endast för team-medlemmar.</p>

        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}

        <form onSubmit={handleSubmit}>
          <label className="persona-input-label">E-post</label>
          <input
            type="email"
            required
            autoComplete="email"
            className="persona-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="persona-input-label">Lösenord</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="persona-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
            {busy ? 'Vänta…' : mode === 'signin' ? 'Logga in' : 'Skapa konto'}
          </button>
        </form>

        <div className="auth-toggle">
          {mode === 'signin' ? (
            <>
              Inget konto?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(null); setInfo(null); }}>
                Skapa ett här
              </button>
            </>
          ) : (
            <>
              Har du redan ett konto?{' '}
              <button type="button" onClick={() => { setMode('signin'); setError(null); setInfo(null); }}>
                Logga in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
