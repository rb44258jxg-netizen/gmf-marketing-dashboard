// Trivial diagnostik-endpoint utan imports.
// Om denna svarar snabbt men chat/briefing/etc hänger → problem i deras imports.
// Om även denna hänger → Vercel infrastruktur-problem.

export default async function handler(_req: Request): Promise<Response> {
  return new Response(
    JSON.stringify({ ok: true, ts: Date.now() }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
