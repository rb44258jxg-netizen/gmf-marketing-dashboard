import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { FUNNELS_ENABLED } from '../lib/featureFlags';

const ALL_TABS = [
  { to: '/', label: 'Översikt' },
  { to: '/plan', label: 'Plan' },
  { to: '/content', label: 'Innehåll' },
  { to: '/channels', label: 'Kanaler' },
  { to: '/cases', label: 'Cases' },
  { to: '/funnels', label: 'Funnels', flag: 'funnels' as const },
  { to: '/knowledge', label: 'Knowledge' },
  { to: '/insights', label: 'Insikter' },
];

const TABS = ALL_TABS.filter((t) => {
  if (t.flag === 'funnels') return FUNNELS_ENABLED;
  return true;
});

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="shell">
      <header className="header">
        <div className="header-brand">
          <img src="/logo-deep-teal.png" alt="GreenMerc" className="header-logo" />
          <h1>Marknadsteam</h1>
        </div>
        <div className="header-links">
          <span className="header-meta">{user?.email}</span>
          <a
            href="https://finance.greenmerc.com/admin"
            target="_blank"
            rel="noreferrer"
            className="header-link primary"
          >
            Admin Panel
          </a>
          <a
            href="https://dashboard.mailerlite.com"
            target="_blank"
            rel="noreferrer"
            className="header-link"
          >
            MailerLite
          </a>
          <button className="header-link danger" onClick={() => signOut()}>
            Logga ut
          </button>
        </div>
      </header>

      <nav className="tabs" key={location.pathname}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      {children}
    </div>
  );
}
