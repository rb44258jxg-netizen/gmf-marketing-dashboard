# `/api/*` — experimentell

**Status (2026-05-05): EJ I PRODUKTIONSANVÄNDNING.**

Alla AI-anrop till routes i den här mappen är avstängda i frontend via
`src/lib/featureFlags.ts` → `AI_ACTIONS_ENABLED = false`.

## Varför

Vercel Functions på Hobby-tier i arn1-regionen hänger ~5 minuter och returnerar
`FUNCTION_INVOCATION_TIMEOUT` på samtliga routes — även en pre-Sprint-5
baseline-deploy uppvisade samma symtom. Det är ett infrastrukturellt problem
som inte kunde lösas via kodfixar.

Pågående diagnostik:
- `pdf-parse@2.x` ESM-default-export saknades → fixat (PR #3, #4)
- Build-cache rensad → ingen skillnad
- Edge-runtime-hypotes outestad
- `/api/ping` (trivial endpoint utan imports) deployades men resultatet av
  POST/GET mot den behöver verifieras när Vercel-arn1 inte hänger

## Routes

| Route | Avsedd funktion | Manuell ersättning idag |
|---|---|---|
| `/api/chat` | Anthropic-proxy för Bottar-fliken | Använd Claude Code/claude.ai direkt |
| `/api/case-extract` | PDF-extraction → bolagsfakta | Cases-sidans "Klistra in text manuellt"-form |
| `/api/case-plan` | AI-marknadsplan per case | Cases-sidans "Klistra in text manuellt"-form |
| `/api/briefing` | Veckobriefing-cron | Briefing-sidans paste-form (kommer) |
| `/api/ingest-run` | Schemalagda marketing-tasks POSTar hit | `/runs`-sidans "+ Lägg till körning"-form |
| `/api/mailerlite` | MailerLite-proxy | Inte aktivt — MailerLite-stats kan kommas åt direkt |
| `/api/ping` | Diagnostik-endpoint | n/a |

## När infran är löst

1. Sätt `AI_ACTIONS_ENABLED = true` i `src/lib/featureFlags.ts`
2. Bekräfta att alla routes svarar inom 5s med rimliga statuskoder (401/200/etc.)
3. Lämna paste-formulären kvar — de är fortfarande användbara som fallback

## Inte ta bort

Koden här är inte deprecated, bara pausad. När Vercel-flappen är fixad eller
projektet flyttas till Pro-tier / annan host plockar vi upp dem igen.
