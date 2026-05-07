// Centrala feature-flags. Stäng av AI-actions globalt här.
//
// Bakgrund (2026-05-05): Vercel Functions på Hobby-tier hänger 5min på
// /api/chat, /api/case-extract, /api/case-plan, /api/briefing, /api/ingest-run
// utan tydlig orsak. Tills infra-frågan är löst kör vi dashboarden i
// "human + Supabase"-läge — manuella paste-formulär istället för AI-anrop.
//
// När AI-anropen fungerar igen: sätt AI_ACTIONS_ENABLED till true.

export const AI_ACTIONS_ENABLED = false;

// Funnels (lead-orchestrering) är pausat 2026-05-06 — vi kör all e-post-
// orkestrering direkt i MailerLite. Koden i src/pages/Funnels.tsx + audience-lib
// + supabase/functions/mailerlite-sync/ ligger kvar för framtida bruk men
// fliken döljs i Layout.tsx.
export const FUNNELS_ENABLED = false;
