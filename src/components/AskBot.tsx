import { Link } from 'react-router-dom';
import { findBot } from '../lib/bots';

interface Props {
  botSlug: string;
  label?: string;
  /** Förifyll textrutan med detta meddelande (skickas inte automatiskt) */
  prefill?: string;
  /** Litet stilval — kompakt knapp för inline-användning på items */
  size?: 'normal' | 'small';
}

export default function AskBot({ botSlug, label, prefill, size = 'normal' }: Props) {
  const bot = findBot(botSlug);
  if (!bot) return null;
  const params = new URLSearchParams({ bot: bot.slug });
  if (prefill) params.set('prefill', prefill);
  const isSmall = size === 'small';
  return (
    <Link
      to={`/chat?${params.toString()}`}
      className={isSmall ? 'content-action-btn' : 'header-link'}
      style={
        isSmall
          ? { background: bot.color + '15', borderColor: bot.color + '40', color: bot.color }
          : { background: bot.color + '15', borderColor: bot.color + '40', color: bot.color }
      }
      title={bot.description}
    >
      <span>{bot.icon}</span>
      <span>{label ?? `Fråga ${bot.name}`}</span>
    </Link>
  );
}
