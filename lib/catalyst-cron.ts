import { getCatalystApp, withCatalystTimeout } from "./catalyst-client";

/**
 * Registers the scheduled job that drives proactive alerts.
 *
 * Catalyst has no declarative cron config (nothing in catalyst.json) — a cron
 * is either drawn in the console or created at runtime through the SDK as a
 * "dynamic" cron. This is the second: the app registers its own schedule the
 * first time the endpoint is called from inside AppSail, so the deployment is
 * reproducible instead of a click-path someone has to remember.
 *
 * The job is a webhook back into this same app: Catalyst's job pool calls
 * `GET /api/cron/insights` with the CRON_SECRET bearer, which recomputes the
 * insight cache and fans the findings out as per-officer alerts.
 */

const CRON_NAME = process.env.CATALYST_CRON_NAME ?? "khabri-alerts";
const JOBPOOL_NAME = process.env.CATALYST_JOBPOOL_NAME ?? "khabri-jobs";
const EVERY_HOURS = Number(process.env.CATALYST_CRON_EVERY_HOURS ?? 3);
const TARGET_PATH = "/api/cron/insights";

// The SDK ships its job-scheduling types behind a deep path that is not in the
// package's export map, so the shapes it validates are declared structurally
// here. Keys and literals match zcatalyst-sdk-node/lib/job-scheduling/types.
type WebhookJob = {
  job_name: string;
  target_type: "Webhook";
  jobpool_name: string;
  url: string;
  request_method: string;
  headers?: Record<string, string>;
  job_config?: { number_of_retries: number; retry_interval: number };
};

type AppSailJob = Omit<WebhookJob, "target_type"> & { target_type: "AppSail"; target_name: string };

type PeriodicCron = {
  cron_name: string;
  description?: string;
  cron_status: boolean;
  cron_type: "Periodic";
  cron_detail: { hour: number; minute: number; second: number; timezone?: string; repetition_type: "every" };
  job_meta: WebhookJob | AppSailJob;
};

type CronApi = {
  getAllCron(): Promise<Array<{ id: string; cron_name: string; cron_status: boolean }>>;
  createCron(c: unknown): Promise<{ id: string; cron_name: string }>;
  deleteCron(id: string): Promise<unknown>;
  runCron(id: string): Promise<unknown>;
};

function cronApi(req: Request): CronApi {
  const app = getCatalystApp(req);
  if (!app) {
    throw new Error(
      "Catalyst SDK unavailable — job scheduling only works from inside AppSail. Deploy first, then call this route on the AppSail URL."
    );
  }
  return (app.jobScheduling() as unknown as { cron(): CronApi }).cron();
}

/** The app's own public origin, which the job pool has to be able to reach. */
function baseUrl(req: Request): string {
  const explicit = process.env.CATALYST_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function buildCron(req: Request): PeriodicCron {
  const secret = process.env.CRON_SECRET;
  const url = `${baseUrl(req)}${TARGET_PATH}`;
  const headers = secret ? { Authorization: `Bearer ${secret}` } : undefined;
  const job = {
    job_name: `${CRON_NAME}-job`,
    jobpool_name: JOBPOOL_NAME,
    url,
    request_method: "GET",
    headers,
    // A transient failure (cold start, a slow embedding call) should not lose
    // a cycle — the next run is hours away.
    job_config: { number_of_retries: 2, retry_interval: 900_000 },
  };

  // An AppSail job pool calls the service directly by name; a webhook pool
  // calls the public URL. Webhook is the default because it needs no extra
  // pool type, but AppSail is one env var away.
  const job_meta: WebhookJob | AppSailJob =
    process.env.CATALYST_CRON_TARGET === "appsail"
      ? { ...job, target_type: "AppSail", target_name: process.env.CATALYST_APPSAIL_NAME ?? "khabriai" }
      : { ...job, target_type: "Webhook" };

  return {
    cron_name: CRON_NAME,
    description: `Recomputes crime insights and pushes new findings to officers as alerts, every ${EVERY_HOURS}h`,
    cron_status: true,
    cron_type: "Periodic",
    cron_detail: { hour: EVERY_HOURS, minute: 0, second: 0, timezone: "Asia/Kolkata", repetition_type: "every" },
    job_meta,
  };
}

export type CronStatus = { name: string; id: string | null; active: boolean; everyHours: number; target: string };

export async function getAlertsCron(req: Request): Promise<CronStatus> {
  const crons = await withCatalystTimeout(cronApi(req).getAllCron(), 10_000);
  const mine = crons.find((c) => c.cron_name === CRON_NAME);
  return {
    name: CRON_NAME,
    id: mine?.id ?? null,
    active: Boolean(mine?.cron_status),
    everyHours: EVERY_HOURS,
    target: `${baseUrl(req)}${TARGET_PATH}`,
  };
}

/**
 * Idempotent: an existing cron of the same name is left alone unless `force`
 * is set, in which case it is deleted and recreated (the way to change the
 * interval or the target URL after a redeploy).
 */
export async function ensureAlertsCron(req: Request, { force = false } = {}): Promise<CronStatus & { created: boolean }> {
  const api = cronApi(req);
  const existing = (await withCatalystTimeout(api.getAllCron(), 10_000)).find((c) => c.cron_name === CRON_NAME);

  if (existing && !force) {
    return { name: CRON_NAME, id: existing.id, active: Boolean(existing.cron_status), everyHours: EVERY_HOURS, target: `${baseUrl(req)}${TARGET_PATH}`, created: false };
  }
  if (existing) await withCatalystTimeout(api.deleteCron(existing.id), 10_000);

  const created = await withCatalystTimeout(api.createCron(buildCron(req)), 15_000);
  return { name: CRON_NAME, id: created.id, active: true, everyHours: EVERY_HOURS, target: `${baseUrl(req)}${TARGET_PATH}`, created: true };
}

/** Fires the registered cron once, so a deployment can be proved without waiting for the interval. */
export async function runAlertsCronNow(req: Request): Promise<{ ok: boolean; id: string | null }> {
  const status = await getAlertsCron(req);
  if (!status.id) return { ok: false, id: null };
  await withCatalystTimeout(cronApi(req).runCron(status.id), 20_000);
  return { ok: true, id: status.id };
}
