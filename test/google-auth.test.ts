import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGoogleClaims } from "../lib/google-auth";

const CLIENT_ID = "123.apps.googleusercontent.com";
const NOW = 1_700_000_000_000; // ms
const good = {
  aud: CLIENT_ID,
  email: "officer@ksp.gov.in",
  email_verified: "true",
  exp: String(NOW / 1000 + 3600),
  given_name: "Asha",
  family_name: "Rao",
};

test("happy path returns the verified identity", () => {
  assert.deepEqual(validateGoogleClaims(good, CLIENT_ID, NOW), {
    email: "officer@ksp.gov.in",
    firstName: "Asha",
    lastName: "Rao",
  });
});

test("rejects a token minted for another client", () => {
  assert.equal(validateGoogleClaims({ ...good, aud: "someone-else" }, CLIENT_ID, NOW), null);
});

test("rejects an unverified email", () => {
  assert.equal(validateGoogleClaims({ ...good, email_verified: "false" }, CLIENT_ID, NOW), null);
});

test("rejects an expired token", () => {
  assert.equal(validateGoogleClaims({ ...good, exp: String(NOW / 1000 - 1) }, CLIENT_ID, NOW), null);
});

test("rejects garbage (missing email / exp)", () => {
  assert.equal(validateGoogleClaims({ aud: CLIENT_ID, email_verified: "true" }, CLIENT_ID, NOW), null);
  assert.equal(validateGoogleClaims({ ...good, exp: "not-a-number" }, CLIENT_ID, NOW), null);
});

test("falls back to name-from-email when Google sends no name", () => {
  const { given_name: _g, family_name: _f, ...noName } = good;
  assert.deepEqual(validateGoogleClaims(noName, CLIENT_ID, NOW), {
    email: "officer@ksp.gov.in",
    firstName: "officer",
    lastName: "",
  });
});
