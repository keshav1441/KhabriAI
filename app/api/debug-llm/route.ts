import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const QUICKML_URL = `https://api.catalyst.zoho.in/quickml/v1/project/${process.env.CATALYST_PROJECT_ID}/glm/chat`;
  const token = process.env.CATALYST_AUTH_TOKEN ?? "";

  // Step 1: get org ID from Zoho accounts
  let orgId = "";
  const userInfoResults: Record<string, unknown> = {};

  for (const url of [
    "https://accounts.zoho.in/oauth/user/info",
    "https://accounts.zoho.in/api/v1/me",
    "https://accounts.zoho.in/api/v1/orgs",
  ]) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      const txt = await r.text();
      userInfoResults[url] = { status: r.status, body: txt.slice(0, 400) };
      if (r.ok && !orgId) {
        try {
          const j = JSON.parse(txt);
          orgId = j.ORGID ?? j.org_id ?? j.orgId ?? j.account_id ?? j.OrgId ?? "";
        } catch {}
      }
    } catch (e) {
      userInfoResults[url] = String(e);
    }
  }

  // Step 2: try QuickML with discovered org ID and common header names
  const body = JSON.stringify({
    model: process.env.CATALYST_GLM_MODEL ?? "crm-di-glm47b_30b_it",
    messages: [{ role: "user", content: "Say hi." }],
  });

  const quickmlResults: Record<string, unknown> = {};
  if (orgId) {
    for (const headerName of ["X-ZohoCatalyst-OrgId", "X-ORGID", "X-Zoho-OrgId"]) {
      try {
        const r = await fetch(QUICKML_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${token}`, [headerName]: orgId },
          body,
        });
        quickmlResults[`${headerName}:${orgId}`] = { status: r.status, body: (await r.text()).slice(0, 300) };
      } catch (e) { quickmlResults[headerName] = String(e); }
    }
  }

  return Response.json({ orgIdFound: orgId, userInfoResults, quickmlResults });
}
