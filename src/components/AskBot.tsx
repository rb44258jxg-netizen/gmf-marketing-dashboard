import { Link } from 'react-router-dom';
import { findBot } from '../lib/bots';
import { AI_ACTIONS_ENABLED } from '../lib/featureFlags';

interface Props {
  botSlug: string;
  label?: string;
  /** Förifyll textrutan med detta meddelande (skickas inte automatiskt) */
  prefill?: string;
  /** Litet stilval — kompakt knapp för inline-användning på items */
  size?: 'normal' | 'small';
  /** "on-dark" används inuti card-hero/mörka bakgrunder för läsbarhet */
  variant?: 'on-light' | 'on-dark';
}

export default function AskBot({ botSlug, label, prefill, size = 'normal', variant = 'on-light' }: Props) {
  // AI-actions globalt avstängda tills Vercel-infra är fixad. Se featureFlags.ts.
  if (!AI_ACTIONS_ENABLED) return null;
  const bot = findBot(botSlug);
  if (!bot) return null;
  const params = new URLSearchParams({ bot: bot.slug });
  if (prefill) params.set('prefill', prefill);
  const isSmall = size === 'small';
  const isDark = variant === 'on-dark';

  // På ljus bakgrund: bot.color som accent
  // På mörk bakgrund: vit text + halvtransparent vit bg så bot.color inte försvinner
  const style: React.CSSProperties = isDark
    ? {
        background: 'rgba(255, 255, 255, 0.18)',
        borderColor: 'rgba(255, 255, 255, 0.32)',
        color: '#ffffff',
        backdropFilter: 'blur(4px)',
        fontWeight: 600,
      }
    : {
        background: bot.color + '18',
        borderColor: bot.color + '50',
        color: bot.color,
      };

  return (
    <Link
      to={`/chat?${params.toString()}`}
      className={isSmall ? 'content-action-btn' : 'header-link'}
      style={style}
      title={bot.description}
    >
      <span>{bot.icon}</span>
      <span>{label ?? `Fråga ${bot.name}`}</span>
    </Link>
  );
}
