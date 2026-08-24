import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLiterals, similarNames } from "../lib/entity-resolve";

const vocab = {
  DistrictName: ["Bengaluru Urban", "Bengaluru Rural", "Mysuru", "Belagavi", "Kalaburagi", "Tumakuru"],
  UnitName: ["Mysuru City PS", "Mysuru East PS"],
  CrimeHeadName: ["Theft", "Online Fraud"],
  CrimeGroupName: ["Cybercrimes"],
};

test("exact literals are left untouched", () => {
  const sql = `SELECT 1 FROM "District" d WHERE d."DistrictName" = 'Mysuru'`;
  assert.deepEqual(resolveLiterals(sql, vocab), { sql, substitutions: [] });
});

test("a misspelled district is rewritten to the closest known value", () => {
  const out = resolveLiterals(`WHERE d."DistrictName" = 'Belgavi' AND x = 1`, vocab);
  assert.equal(out.sql, `WHERE d."DistrictName" = 'Belagavi' AND x = 1`);
  assert.deepEqual(out.substitutions, [{ column: "DistrictName", from: "Belgavi", to: "Belagavi" }]);
});

test("legacy anglicised names resolve via the alias table", () => {
  assert.equal(resolveLiterals(`d."DistrictName" = 'Bangalore'`, vocab).sql, `d."DistrictName" = 'Bengaluru Urban'`);
  assert.equal(resolveLiterals(`d."DistrictName" = 'Gulbarga'`, vocab).sql, `d."DistrictName" = 'Kalaburagi'`);
});

test("a literal nothing like any known value is left alone", () => {
  const sql = `d."DistrictName" = 'Zzzzqx'`;
  assert.deepEqual(resolveLiterals(sql, vocab), { sql, substitutions: [] });
});

test("resolution is case-insensitive and covers stations and crime types", () => {
  const out = resolveLiterals(`u."UnitName" = 'mysuru city ps' AND csh."CrimeHeadName" = 'online fraud'`, vocab);
  assert.equal(out.sql, `u."UnitName" = 'Mysuru City PS' AND csh."CrimeHeadName" = 'Online Fraud'`);
});

test("similarNames ranks close person names and drops unrelated ones", () => {
  const names = ["Priya Bhat", "Priya Bhatt", "Ramesh Gowda", "Priyanka Bhat"];
  assert.deepEqual(similarNames("Priya Bhatt", names, 3), ["Priya Bhatt", "Priya Bhat", "Priyanka Bhat"]);
  assert.deepEqual(similarNames("Xqzv", names, 3), []);
});

test("a bare first name that matches many distinct people is flagged as ambiguous", () => {
  const { ambiguousPerson } = require("../lib/entity-resolve") as typeof import("../lib/entity-resolve");
  const people = ["Ravi Kumar", "Ravi Shankar", "Ravi Gowda", "Ravindra Patil", "Priya Bhat", "M Ravi"];
  assert.deepEqual(ambiguousPerson(`WHERE a."AccusedName" ILIKE '%Ravi%'`, people, 3), { token: "Ravi", count: 4, examples: ["M Ravi", "Ravi Gowda", "Ravi Kumar", "Ravi Shankar"] });
  assert.equal(ambiguousPerson(`WHERE a."AccusedName" ILIKE '%Priya Bhat%'`, people, 3), null);
  assert.equal(ambiguousPerson(`WHERE a."AccusedName" ILIKE '%Ravi%'`, people, 10), null);
  assert.equal(ambiguousPerson(`WHERE d."DistrictName" = 'Mysuru'`, people, 3), null);
});
