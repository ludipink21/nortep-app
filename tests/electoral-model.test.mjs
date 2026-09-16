import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { candidatesFor, totalsFor, validateQuery, readSaved, queryFromUrl, queryUrl, csvCell, canUseElectoral, ratio } from "../app/analise-eleitoral/model.ts";

const data = JSON.parse(await readFile(new URL("../app/analise-eleitoral/data/mg-2024.json", import.meta.url)));
const betim = data.contests.find(contest => contest.id === "619:41335");

test("official MG data reconciles candidates, turnout and electorate for every contest and zone", () => {
  assert.equal(new Set(data.contests.map(c => c.municipalityId)).size, 853);
  assert.equal(data.contests.length, 855);
  for (const contest of data.contests) {
    assert.equal(contest.year, 2024);
    assert.equal(contest.officeId, "11");
    for (const zone of ["all", ...Object.keys(contest.zones)]) {
      const total = totalsFor(contest, zone);
      assert.equal(total.electorate, total.turnout + total.abstentions, `${contest.id}/${zone} electorate`);
      assert.equal(total.turnout, total.valid + total.blank + total.nullVotes + total.annulled + total.pending + total.separate, `${contest.id}/${zone} turnout`);
      assert.equal(total.valid, candidatesFor(contest, zone).reduce((sum, c) => sum + c.votes, 0), `${contest.id}/${zone} votes`);
    }
  }
});

test("Betim uses valid votes, a common denominator and the official 2024 totals", () => {
  const candidates = candidatesFor(betim, "all");
  assert.deepEqual(candidates.map(c => [c.name, c.votes]), [["HERON GUIMARAES", 108557], ["DR.VINICIUS", 79096], ["PEDRO BETINENSE", 18734], ["ZULU", 554]]);
  assert.equal(totalsFor(betim, "all").valid, 206941);
  assert.equal(candidates[0].percentage, 108557 / 206941 * 100);
  assert.equal(candidates[0].votes - candidates[1].votes, 29461);
  assert.equal(ratio(0, 0), null);
});

test("ties retain the same rank, and annulled votes are not added to valid results", () => {
  const contest = { ...betim, zones: { "1": { ...totalsFor(betim, "all"), valid: 20 } }, candidates: [
    { id: "a", name: "A", zones: { "1": { valid: 10, recorded: 12 } } },
    { id: "b", name: "B", zones: { "1": { valid: 10, recorded: 10 } } },
    { id: "c", name: "C", zones: { "1": { valid: 0, recorded: 50 } } },
  ] };
  const rows = candidatesFor(contest, "1");
  assert.deepEqual(rows.map(r => r.rank), [1, 1, 3]);
  assert.equal(rows[0].percentage, 50);
  assert.equal(rows[2].votes, 0);
  assert.equal(rows[2].recorded, 50);
});

test("saved queries and incoming links reject invalid geographic context and foreign candidates", () => {
  const q = { contestId: betim.id, zone: "all", candidateIds: [betim.candidates[0].id, betim.candidates[0].id, "foreign"], search: "Heron", party: "unknown" };
  const valid = validateQuery(q, data);
  assert.deepEqual(valid.candidateIds, [betim.candidates[0].id]);
  assert.equal(valid.party, "all");
  assert.equal(validateQuery({ ...q, zone: "__proto__" }, data), null);
  assert.equal(validateQuery({ ...q, zone: "missing" }, data), null);
  assert.equal(validateQuery({ ...q, contestId: "missing" }, data), null);
  const restored = queryFromUrl(new URL(queryUrl({ ...valid, search: "" }), "https://example.com").searchParams, data);
  assert.deepEqual(restored, { ...valid, search: "" });
  assert.deepEqual(readSaved("not json", data), []);
  assert.deepEqual(readSaved(JSON.stringify([{ id: "a", name: "A", savedAt: "bad date", datasetVersion: "1", query: q }]), data), []);
});

test("CSV protects spreadsheet formulas and keeps names and quotes intact", () => {
  assert.equal(csvCell('Nome "com aspas"'), '"Nome ""com aspas"""');
  for (const value of ["=1+1", "+CMD", "-1", "@SUM(A1)", "  =SUM(A1)", "\tfoo"]) assert.ok(csvCell(value).startsWith('"\''));
});

test("electoral entry accepts only the enabled application roles", () => {
  for (const role of ["admin", "coordenador", "supervisor", "observador"]) assert.equal(canUseElectoral(role), true);
  for (const role of ["pesquisador", "publico", "unknown", ""]) assert.equal(canUseElectoral(role), false);
});
