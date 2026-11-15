// Pure logic for Seq2Find: no document, no fetch, no storage. app.js handles the page;
// everything here takes arguments and returns values so tests can call it directly.

// "1 match" / "3 matches": sibilant endings take -es.
export const plural = (n, word) =>
  `${n} ${word}${n === 1 ? "" : /(s|x|z|ch|sh)$/.test(word) ? "es" : "s"}`;

// Only http(s) links are rendered. NCBI returns ftp:// URLs, which current browsers no longer
// open, but the same paths are served over https.
export function safeUrl(u) {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u.replace(/^ftp:\/\//i, "https://"));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

// Turns a FastAPI error `detail` (string or list of validation errors) into one line of text.
export function describeDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
      return field ? `${field}: ${d.msg}` : d.msg;
    }).join("; ");
  }
  return "";
}

// Message shown to the user for an API failure with this HTTP status.
export function friendlyMessage(status, message) {
  if (status === 502) return "GEO or OpenAI could not be reached. Please try again in a moment.";
  if (status === 422) return `Please check your input. ${message}`;
  return message;
}

// Label for a download link, based on where it points.
export function linkLabel(href) {
  return /\/suppl\/?$/.test(href) ? "Supplementary files" : "Series files";
}

// Builds the search request from the raw text of the form fields.
export function parseQuery(raw) {
  const trim = (s) => String(s ?? "").trim();
  const query = {
    methodology: trim(raw.methodology),
    organism: trim(raw.organism),
    tissue: trim(raw.tissue),
    conditions: String(raw.conditions ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    max_results: parseInt(raw.max_results, 10) || 10,
  };
  const availability = trim(raw.data_availability);
  if (availability) query.data_availability = availability;
  return query;
}

// Numbers for the stat cards. `current` is the latest search ({query, results}) or null.
export function summarizeStats(current, savedCount) {
  const asked = Boolean(current && current.query.data_availability);
  return {
    results: current ? String(current.results.length) : "—",
    asked,
    meetsRequirement: asked ? String(current.results.filter((r) => r.meets_data_availability).length) : null,
    saved: String(savedCount),
  };
}
