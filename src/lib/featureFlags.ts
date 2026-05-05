// Centrala feature-flags. Stäng av AI-actions globalt här.
//
// Bakgrund (2026-05-05): Vercel Functions på Hobby-tier hänger 5min på
// /api/chat, /api/case-extract, /api/case-plan, /api/briefing, /api/ingest-run
// utan tydlig orsak. Tills infra-frågan är löst kör vi dashboarden i
// "human + Supabase"-läge — manuella paste-formulär istället för AI-anrop.
//
// När AI-anropen fungerar igen: sätt AI_ACTIONS_ENABLED till true.

export const AI_ACTIONS_ENABLED = false;
