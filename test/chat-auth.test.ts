import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/session";
import { sessionEmailsForTest } from "../lib/chat-auth";

test("the session cookie is found wherever it sits in the Cookie header", () => {
  const token = createSessionToken("sho@ksp.test");
  const stale = createSessionToken("gone@ksp.test");
  assert.deepEqual(sessionEmailsForTest(new Request("http://x", { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })), ["sho@ksp.test"]);
  assert.deepEqual(sessionEmailsForTest(new Request("http://x", { headers: { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=${token}; other=1` } })), ["sho@ksp.test"]);
  assert.deepEqual(sessionEmailsForTest(new Request("http://x", { headers: { cookie: `${SESSION_COOKIE_NAME}=${stale}; ${SESSION_COOKIE_NAME}=${token}` } })), ["gone@ksp.test", "sho@ksp.test"]);
  assert.deepEqual(sessionEmailsForTest(new Request("http://x", { headers: { cookie: `${SESSION_COOKIE_NAME}=tampered.sig` } })), []);
});
