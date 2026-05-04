import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

const TABS = [
  { to: '/', label: 'Översikt' },
  { to: '/knowledge', label: 'Knowledge' },
  { to: '/content', label: 'Innehåll' },
  { to: '/email', label: 'E-post' },
  { to: '/social', label: 'Sociala medier' },
  { to: '/channels', label: 'Kanaler' },
  { to: '/briefing', label: 'Briefing' },
  { to: '/chat', label: '🤖 Bottar' },
  { to: '/audit', label: 'Audit' },
];

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
