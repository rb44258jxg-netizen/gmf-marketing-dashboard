import { Link } from 'react-router-dom';
import { findBot } from '../lib/bots';

interface Props {
  botSlug: string;
  label?: string;
}

export default function AskBot({ botSlug, label }: Props) {
  const bot = findBot(botSlug);
  if (!bot) return null;
  return (
    <Link
      to={`/chat?bot=${bot.slug}`}
      className="header-link"
      style={{
        background: bot.color + '15',
        borderColor: bot.color + '40',
        color: bot.color,
      }}
      title={bot.description}
    >
      <span>{bot.icon}</span>
      <span>{label ?? `Fråga ${bot.name}`}</span>
    </Link>
  );
}
