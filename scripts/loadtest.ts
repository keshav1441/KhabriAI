// Latency / concurrency check against a running instance.
//   npx tsx scripts/loadtest.ts [--base=http://localhost:3000] [--concurrency=5] [--rounds=2]
// Signs in with LOADTEST_EMAIL / LOADTEST_PASSWORD (creates the user if needed),
// then fires the demo questions concurrently through /api/chat and reports
// time-to-first-token and total time (p50 / p95), plus any failures.
import "dotenv/config";

const arg = (k: string, d: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const BASE = arg("base", "http://localhost:3000");
const CONCURRENCY = Number(arg("concurrency", "5"));
const ROUNDS = Number(arg("rounds", "2"));
const EMAIL = process.env.LOADTEST_EMAIL ?? "loadtest@ksp.test";
const PASSWORD = process.env.LOADTEST_PASSWORD ?? "LoadTest#2026";

const QUESTIONS = [
  "How many FIRs were registered in the last 30 days?",
  "Top 5 districts by theft cases this year",
  "Which districts have rising crime this month compared to last month?",
  "Show cases linked to accused KSP-P-00928",
  "Monthly trend of cybercrime cases in 2025",
  "How many arrests were made in Mysuru last month?",
  "ಬೆಂಗಳೂರು ನಗರದಲ್ಲಿ ಎಷ್ಟು ಪ್ರಕರಣಗಳು ಇನ್ನೂ ತನಿಖೆಯಲ್ಲಿವೆ?",
];

async function signIn(): Promise<string> {
  await fetch(`${BASE}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: "Load", lastName: "Test", email: EMAIL, password: PASSWORD }) }).catch(() => null);
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

async function ask(cookie: string, message: string) {
  const t0 = Date.now();
  let firstToken = 0, ok = false, bytes = 0;
  try {
    const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message, history: [], lang: "en" }) });
    if (!r.ok || !r.body) return { message, ok: false, ttft: 0, total: Date.now() - t0, status: r.status };
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (!firstToken && new TextDecoder().decode(value).includes('"token"')) firstToken = Date.now() - t0;
    }
    ok = bytes > 0;
  } catch { ok = false; }
  return { message, ok, ttft: firstToken, total: Date.now() - t0, status: 200 };
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };

async function main() {
  const cookie = await signIn();
  const results: Awaited<ReturnType<typeof ask>>[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const batch = QUESTIONS.slice(0, CONCURRENCY);
    const t0 = Date.now();
    results.push(...(await Promise.all(batch.map((q) => ask(cookie, q)))));
    console.log(`round ${round + 1}: ${batch.length} concurrent in ${Date.now() - t0} ms`);
  }
  const ok = results.filter((r) => r.ok);
  console.log(`\n${ok.length}/${results.length} succeeded @ ${BASE} (concurrency ${CONCURRENCY})`);
  console.log(`time to first token  p50 ${pct(ok.map((r) => r.ttft), 50)} ms   p95 ${pct(ok.map((r) => r.ttft), 95)} ms`);
  console.log(`total                p50 ${pct(ok.map((r) => r.total), 50)} ms   p95 ${pct(ok.map((r) => r.total), 95)} ms`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL ${r.status} ${r.total} ms  ${r.message}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
