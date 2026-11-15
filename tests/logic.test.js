import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plural, safeUrl, describeDetail, friendlyMessage, linkLabel, parseQuery, summarizeStats,
} from "../logic.js";

// ---- plural -------------------------------------------------------------------------------
test("plural: exactly one is singular", () => {
  assert.equal(plural(1, "sample"), "1 sample");
});
test("plural: zero is plural (boundary just below one)", () => {
  assert.equal(plural(0, "sample"), "0 samples");
});
test("plural: two is plural", () => {
  assert.equal(plural(2, "sample"), "2 samples");
});
test("plural: sibilant endings take -es", () => {
  assert.equal(plural(3, "match"), "3 matches");
  assert.equal(plural(2, "box"), "2 boxes");
  assert.equal(plural(2, "bus"), "2 buses");
});
test("plural: sibilant word is still singular for one", () => {
  assert.equal(plural(1, "match"), "1 match");
});

// ---- safeUrl ------------------------------------------------------------------------------
test("safeUrl: https passes through", () => {
  assert.equal(safeUrl("https://ncbi.nlm.nih.gov/geo/"), "https://ncbi.nlm.nih.gov/geo/");
});
test("safeUrl: http is allowed", () => {
  assert.equal(safeUrl("http://example.org/a"), "http://example.org/a");
});
test("safeUrl: ftp is rewritten to https, case-insensitively", () => {
  assert.equal(safeUrl("ftp://ftp.ncbi.nlm.nih.gov/geo/series/GSE1/suppl/"),
    "https://ftp.ncbi.nlm.nih.gov/geo/series/GSE1/suppl/");
  assert.equal(safeUrl("FTP://host.org/x"), "https://host.org/x");
});
test("safeUrl: javascript: and data: URLs are rejected", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), null);
});
test("safeUrl: non-strings and garbage return null instead of throwing", () => {
  assert.equal(safeUrl(undefined), null);
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl(42), null);
  assert.equal(safeUrl(""), null);
  assert.equal(safeUrl("not a url"), null);
});

// ---- describeDetail -----------------------------------------------------------------------
test("describeDetail: a string detail is returned unchanged", () => {
  assert.equal(describeDetail("Invalid credentials"), "Invalid credentials");
});
test("describeDetail: validation errors name the field and drop the 'body' prefix", () => {
  const detail = [{ loc: ["body", "organism"], msg: "field required" }];
  assert.equal(describeDetail(detail), "organism: field required");
});
test("describeDetail: multiple errors are joined with '; ' and nested locs with '.'", () => {
  const detail = [
    { loc: ["body", "organism"], msg: "too short" },
    { loc: ["body", "conditions", 0], msg: "bad value" },
  ];
  assert.equal(describeDetail(detail), "organism: too short; conditions.0: bad value");
});
test("describeDetail: an error without loc uses just the message", () => {
  assert.equal(describeDetail([{ msg: "oops" }]), "oops");
});
test("describeDetail: empty list, null and objects give an empty string", () => {
  assert.equal(describeDetail([]), "");
  assert.equal(describeDetail(null), "");
  assert.equal(describeDetail(undefined), "");
  assert.equal(describeDetail({ msg: "x" }), "");
});

// ---- friendlyMessage ----------------------------------------------------------------------
test("friendlyMessage: 502 hides the raw message", () => {
  assert.equal(friendlyMessage(502, "Bad Gateway"),
    "GEO or OpenAI could not be reached. Please try again in a moment.");
});
test("friendlyMessage: 422 prefixes the server's message", () => {
  assert.equal(friendlyMessage(422, "organism: field required"),
    "Please check your input. organism: field required");
});
test("friendlyMessage: other statuses pass the message through", () => {
  assert.equal(friendlyMessage(401, "Invalid credentials"), "Invalid credentials");
  assert.equal(friendlyMessage(0, "Can't reach the server."), "Can't reach the server.");
});

// ---- linkLabel ----------------------------------------------------------------------------
test("linkLabel: /suppl and /suppl/ are supplementary files", () => {
  assert.equal(linkLabel("https://x.org/geo/series/GSE1/suppl"), "Supplementary files");
  assert.equal(linkLabel("https://x.org/geo/series/GSE1/suppl/"), "Supplementary files");
});
test("linkLabel: other paths are series files, including 'suppl' mid-path", () => {
  assert.equal(linkLabel("https://x.org/geo/series/GSE1/"), "Series files");
  assert.equal(linkLabel("https://x.org/suppl/file.tar"), "Series files");
});

// ---- parseQuery ---------------------------------------------------------------------------
const rawForm = (over = {}) => ({
  methodology: "  RNA-seq ", organism: "Homo sapiens", tissue: " liver ",
  conditions: "  drug A \n\n drug B\n   \n", max_results: "5", data_availability: "", ...over,
});
test("parseQuery: trims text fields", () => {
  const q = parseQuery(rawForm());
  assert.equal(q.methodology, "RNA-seq");
  assert.equal(q.tissue, "liver");
});
test("parseQuery: conditions are split on newlines, trimmed, blanks dropped", () => {
  assert.deepEqual(parseQuery(rawForm()).conditions, ["drug A", "drug B"]);
});
test("parseQuery: empty conditions give an empty list", () => {
  assert.deepEqual(parseQuery(rawForm({ conditions: "" })).conditions, []);
  assert.deepEqual(parseQuery(rawForm({ conditions: " \n \n" })).conditions, []);
});
test("parseQuery: max_results parses numbers and defaults to 10 when blank or invalid", () => {
  assert.equal(parseQuery(rawForm({ max_results: "5" })).max_results, 5);
  assert.equal(parseQuery(rawForm({ max_results: "" })).max_results, 10);
  assert.equal(parseQuery(rawForm({ max_results: "abc" })).max_results, 10);
});
test("parseQuery: data_availability is omitted when blank or whitespace", () => {
  assert.equal("data_availability" in parseQuery(rawForm()), false);
  assert.equal("data_availability" in parseQuery(rawForm({ data_availability: "   " })), false);
});
test("parseQuery: data_availability is included, trimmed, when given", () => {
  assert.equal(parseQuery(rawForm({ data_availability: " raw counts " })).data_availability, "raw counts");
});
test("parseQuery: missing fields do not crash or produce 'undefined'", () => {
  const q = parseQuery({});
  assert.equal(q.methodology, "");
  assert.deepEqual(q.conditions, []);
  assert.equal(q.max_results, 10);
});

// ---- summarizeStats -----------------------------------------------------------------------
const result = (meets) => ({ meets_data_availability: meets });
test("summarizeStats: no search yet shows a dash and the saved count", () => {
  assert.deepEqual(summarizeStats(null, 3),
    { results: "—", asked: false, meetsRequirement: null, saved: "3" });
});
test("summarizeStats: without a data requirement, only the result count is shown", () => {
  const cur = { query: {}, results: [result(true), result(false)] };
  assert.deepEqual(summarizeStats(cur, 0),
    { results: "2", asked: false, meetsRequirement: null, saved: "0" });
});
test("summarizeStats: counts only results that meet the requirement", () => {
  const cur = { query: { data_availability: "raw counts" }, results: [result(true), result(false), result(true)] };
  const s = summarizeStats(cur, 1);
  assert.equal(s.asked, true);
  assert.equal(s.results, "3");
  assert.equal(s.meetsRequirement, "2");
});
test("summarizeStats: a requirement with zero matches reports '0', not a dash", () => {
  const cur = { query: { data_availability: "x" }, results: [result(false)] };
  assert.equal(summarizeStats(cur, 0).meetsRequirement, "0");
});
test("summarizeStats: zero results is '0'", () => {
  assert.equal(summarizeStats({ query: {}, results: [] }, 0).results, "0");
});
