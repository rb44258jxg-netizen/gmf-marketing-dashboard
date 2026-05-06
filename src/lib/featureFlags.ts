// Centrala feature-flags. Stäng av AI-actions globalt här.
//
// Bakgrund (2026-05-05): Vercel Functions på Hobby-tier hänger 5min på
// /api/chat, /api/case-extract, /api/case-plan, /api/briefing, /api/ingest-run
// utan tydlig orsak. Tills infra-frågan är löst kör vi dashboarden i
// "human + Supabase"-läge — manuella paste-formulär istället för AI-anrop.
//
// När AI-anropen fungerar igen: sätt AI_ACTIONS_ENABLED till true.

export const AI_ACTIONS_ENABLED = false;

// Funnels-fliken — pausad 2026-05-06.
// Bakgrund: GMF kör all lead-orkestrering (subscribers, automation,
// segmentering, mejl) direkt i MailerLite tills vidare. Dashboardens
// Funnel-funktion duplicerar i praktiken vad MailerLite redan gör bra,
// så den döljs. All kod (Funnels.tsx, audience.ts, leadsCsv.ts,
// mailerlite-sync Edge Function, /api/mailerlite-webhook) behålls i
// repo:t för framtida bruk — sätt FUNNELS_ENABLED = true för att slå
// på fliken igen.
export const FUNNELS_ENABLED = false;
