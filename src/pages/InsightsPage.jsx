import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useData } from "../context/DataContext";
import { fetchAnalyticsSummary, fetchListing } from "../api/dataStore";
import {
  summaryStats,
  findCorruptListings,
  findSuspiciousContacts,
  estimateUniqueProperties,
  avgPricePerSqft2BHK,
  costliestProject,
  listingsInLast7Days,
  projectsWithWrongListingCount,
  totalMonthlyRentForLocality,
} from "../utils/analysis";
import { formatCompactINR, formatNumber } from "../utils/format";

const DRAFT_KEY = "ivy_submission_draft_v1";
const CATEGORIES = [
  "auth",
  "pagination",
  "units",
  "filters",
  "sorting",
  "timestamps",
  "duplicates",
  "completeness",
  "data_quality",
  "fraud",
  "consistency",
  "missing_endpoint",
  "undocumented_endpoint",
];

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export default function InsightsPage() {
  const { listings, rentals, projects } = useData();
  const draft = useMemo(loadDraft, []);

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);

  const [assignedLocality, setAssignedLocality] = useState(
    draft.assignedLocality || import.meta.env.VITE_ASSIGNED_LOCALITY || ""
  );
  const [contactThreshold, setContactThreshold] = useState(draft.contactThreshold || 4);
  const [confirmedCorrupt, setConfirmedCorrupt] = useState(() => new Set(draft.confirmedCorrupt || []));
  const [confirmedFake, setConfirmedFake] = useState(() => new Set(draft.confirmedFake || []));


  // Seed with confirmed findings if no draft yet; user can remove or edit
  const SEED_FINDINGS = [
    {
      endpoint: "*",
      category: "auth",
      documented: "Append the API key as an api_key query parameter on every request.",
      actual: "The server returns HTTP 401 with message 'send your key in the X-API-Key request header, not as a query parameter.' The key must be sent as a header.",
      how_found: "First request using the documented query-param style returned 401 with that exact message.",
      impact: "Every request in the documented style fails authentication entirely.",
      evidence: [],
    },
    {
      endpoint: "/auth/login",
      category: "auth",
      documented: "Response contains field 'token', expires_in: 86400 (24 hours). 'There is no refresh flow.'",
      actual: "Response contains 'access_token' (not 'token'), expires_in: 900 (15 minutes), plus 'refresh_token' and 'refresh_url: /auth/refresh'. A refresh flow exists.",
      how_found: "Inspected the raw login response body. expires_in was 900, not 86400. refresh_token and refresh_url fields were present.",
      impact: "Sessions documented as lasting 24h actually expire in 15 minutes. Apps not implementing the undocumented refresh flow will stop working mid-session.",
      evidence: [],
    },
    {
      endpoint: "/auth/refresh",
      category: "undocumented_endpoint",
      documented: "Not documented. Docs explicitly state 'There is no refresh flow.'",
      actual: "POST /auth/refresh accepts {refresh_token: <token>} and returns a new access_token. This endpoint exists and works.",
      how_found: "Found refresh_url field in the login response pointing to /auth/refresh.",
      impact: "Developers reading only the docs would not know to implement token refresh and their sessions would expire after 15 minutes.",
      evidence: [],
    },
    {
      endpoint: "/v1/listings",
      category: "pagination",
      documented: "Maximum limit is 200. Response shape: {total, page, page_size, results}.",
      actual: "Maximum limit enforced is 50 — sending limit=200 returns only 50 records. Response shape: {limit, offset, count, total, has_more, results}. Fields 'page' and 'page_size' do not appear.",
      how_found: "Sent GET /v1/listings?limit=200 and received a response with 'count':50 and 'limit':50, with has_more:true.",
      impact: "Code relying on the documented 200-record limit would page incorrectly and miss data. Code expecting page/page_size fields would break.",
      evidence: [],
    },
    {
      endpoint: "/v1/listings",
      category: "completeness",
      documented: "Returns only active listings. 'Inactive, expired and withdrawn listings are excluded server side.'",
      actual: "The response includes listings where is_live is false — inactive listings are returned alongside active ones.",
      how_found: "Counted listings with is_live=false in the full retrieved dataset; found records with is_live:false in /v1/listings.",
      impact: "Apps trusting the docs would show inactive listings to users without filtering them out.",
      evidence: [],
    },
    {
      endpoint: "/v1/analytics/summary",
      category: "missing_endpoint",
      documented: "Returns pre-computed aggregates: city, total_listings, median_price, median_price_per_sqft, by_locality, by_bhk.",
      actual: "Returns HTTP 404 with {\"detail\": \"Not Found\"}. The endpoint is not implemented.",
      how_found: "Called GET /v1/analytics/summary after authentication; received 404.",
      impact: "Any dashboard or insights screen relying on this endpoint receives no data.",
      evidence: [],
    },
    {
      endpoint: "/v1/favourites",
      category: "missing_endpoint",
      documented: "GET /v1/favourites returns saved listings for the logged-in user. POST /v1/favourites adds a listing. DELETE /v1/favourites/{id} removes one.",
      actual: "All requests to /v1/favourites return HTTP 404. The endpoint is not implemented.",
      how_found: "Called GET /v1/favourites with a valid Bearer token; received 404.",
      impact: "Saved-listings feature cannot use the API; must fall back to client-side storage.",
      evidence: [],
    },
    {
      endpoint: "/v1/projects",
      category: "units",
      documented: "price_min and price_max are in rupees (integer).",
      actual: "Observed values like 80.0, 38.5, 3.22 — these are clearly lakhs (×100,000), not rupees. A value of 3.22 in rupees would make no sense for a property project.",
      how_found: "Compared price_min/price_max values in /v1/projects responses with prices in /v1/listings for the same properties. Project prices were ~100,000x smaller than expected.",
      impact: "Displaying raw price_min/price_max as rupees shows wildly incorrect prices. Must multiply by 100,000 (1 lakh) before display.",
      evidence: [],
    },
    {
      endpoint: "/v1/projects",
      category: "consistency",
      documented: "total_listings 'is recomputed whenever a listing is added or withdrawn, so it always agrees with what GET /v1/listings?project_id=... returns.'",
      actual: "Many projects report a total_listings that does not match the actual count of listings with that project_id in the retrievable /v1/listings dataset.",
      how_found: "Fetched all listings and all projects, grouped listings by project_id, and compared counts to each project's reported total_listings.",
      impact: "total_listings cannot be trusted as a count of current listings. Users and apps relying on it will see wrong numbers.",
      evidence: [],
    },
  ];

  const [findings, setFindings] = useState(draft.findings?.length ? draft.findings : SEED_FINDINGS);
  // Ghost-listing probe state
  const [probeId, setProbeId] = useState("ZER-3003685");
  const [probeResult, setProbeResult] = useState(null); // null | { ok, status, detail, record }
  const [probeRunning, setProbeRunning] = useState(false);
  const [scanResults, setScanResults] = useState(null); // null | { ghosts: string[], scanned: number }
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const scanAbortRef = useRef(false);

  const [findingForm, setFindingForm] = useState({
    endpoint: "",
    category: "data_quality",
    documented: "",
    actual: "",
    how_found: "",
    impact: "",
    evidence: "",
  });

  useEffect(() => {
    listings.ensure();
    rentals.ensure();
    projects.ensure();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAnalyticsSummary()
      .then(setSummary)
      .catch((err) => setSummaryError(err.detail || err.message || "not available"));
  }, []);

  useEffect(() => {
    saveDraft({
      assignedLocality,
      contactThreshold,
      confirmedCorrupt: [...confirmedCorrupt],
      confirmedFake: [...confirmedFake],
      findings,
    });
  }, [assignedLocality, contactThreshold, confirmedCorrupt, confirmedFake, findings]);

  const stats = useMemo(() => summaryStats(listings.records), [listings.records]);
  const corruptCandidates = useMemo(() => findCorruptListings(listings.records), [listings.records]);
  const suspiciousContacts = useMemo(
    () => findSuspiciousContacts(listings.records, { minDistinctProjects: Number(contactThreshold) || 4 }),
    [listings.records, contactThreshold]
  );
  const uniqueEstimate = useMemo(() => estimateUniqueProperties(listings.records), [listings.records]);
  const excludeSet = useMemo(() => new Set([...confirmedCorrupt, ...confirmedFake]), [confirmedCorrupt, confirmedFake]);
  const priceMetric = useMemo(() => avgPricePerSqft2BHK(listings.records, excludeSet), [listings.records, excludeSet]);
  const costliest = useMemo(() => costliestProject(projects.records), [projects.records]);
  const last7Days = useMemo(() => listingsInLast7Days(listings.records), [listings.records]);
  const wrongCounts = useMemo(
    () => projectsWithWrongListingCount(projects.records, listings.records),
    [projects.records, listings.records]
  );
  const rentTotal = useMemo(
    () => totalMonthlyRentForLocality(rentals.records, assignedLocality),
    [rentals.records, assignedLocality]
  );

  const allLoaded = listings.status === "ready" && rentals.status === "ready" && projects.status === "ready";

  const toggleCorrupt = (id) =>
    setConfirmedCorrupt((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleFakeGroup = (records) =>
    setConfirmedFake((prev) => {
      const next = new Set(prev);
      const allIn = records.every((r) => next.has(r.listing_id));
      records.forEach((r) => (allIn ? next.delete(r.listing_id) : next.add(r.listing_id)));
      return next;
    });

  const addFinding = () => {
    if (!findingForm.endpoint || !findingForm.documented || !findingForm.actual) return;
    setFindings((prev) => [
      ...prev,
      { ...findingForm, evidence: findingForm.evidence.split(",").map((s) => s.trim()).filter(Boolean) },
    ]);
    setFindingForm({ endpoint: "", category: "data_quality", documented: "", actual: "", how_found: "", impact: "", evidence: "" });
  };

  const probeOne = useCallback(async (id) => {
    const target = (id || probeId).trim();
    if (!target) return;
    setProbeRunning(true);
    setProbeResult(null);
    try {
      const record = await fetchListing(target);
      setProbeResult({ ok: true, status: 200, detail: null, record });
    } catch (err) {
      setProbeResult({ ok: false, status: err.status, detail: err.detail || err.message, record: null });
    } finally {
      setProbeRunning(false);
    }
  }, [probeId]);

  const runBatchScan = useCallback(async () => {
    if (!listings.records.length) return;
    setScanRunning(true);
    setScanResults(null);
    setScanProgress(0);
    scanAbortRef.current = false;
    const ghosts = [];
    const ids = listings.records.map((l) => l.listing_id);
    // Probe in small concurrent batches to stay well under 1 200 / min
    const BATCH = 5;
    for (let i = 0; i < ids.length; i += BATCH) {
      if (scanAbortRef.current) break;
      const slice = ids.slice(i, i + BATCH);
      const results = await Promise.allSettled(slice.map((id) => fetchListing(id)));
      results.forEach((r, j) => {
        if (r.status === "rejected" && r.reason?.status === 404) {
          ghosts.push(slice[j]);
        }
      });
      setScanProgress(Math.min(i + BATCH, ids.length));
      // ~250 ms gap between batches → ≈ 1 200 / min max
      await new Promise((res) => setTimeout(res, 250));
    }
    setScanRunning(false);
    setScanResults({ ghosts, scanned: ids.length });
  }, [listings.records]);

  const stopScan = () => { scanAbortRef.current = true; };


  const removeFinding = (idx) => setFindings((prev) => prev.filter((_, i) => i !== idx));  return (
    <div>
      <div className="page-header">
        <h1>Insights</h1>
        <span className="count">{allLoaded ? "full dataset loaded" : "loading full dataset…"}</span>
      </div>

      <div className="section-block">
        <h2>Documented summary — GET /v1/analytics/summary</h2>
        {summaryError && <div className="error-text">Endpoint returned: {summaryError}</div>}
        {summary && (
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="label">city</div>
              <div className="value">{summary.city}</div>
            </div>
            <div className="stat-tile">
              <div className="label">total_listings (documented)</div>
              <div className="value">{formatNumber(summary.total_listings)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">median_price</div>
              <div className="value">{formatCompactINR(summary.median_price)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">median_price_per_sqft</div>
              <div className="value">₹{formatNumber(summary.median_price_per_sqft)}</div>
            </div>
          </div>
        )}
        {summary && summary.total_listings !== listings.records.length && listings.status === "ready" && (
          <p className="error-text">
            analytics/summary claims {summary.total_listings} total_listings, but {listings.records.length} records
            are actually retrievable from /v1/listings — worth a `consistency` finding.
          </p>
        )}
      </div>

      <div className="section-block">
        <h2>The ten answers (Part 2) — live, recalculated as you confirm candidates below</h2>
        <div className="stat-grid">
          <Stat label="1. total_listing_records" value={formatNumber(listings.records.length)} />
          <Stat label="2. unique_properties" value={formatNumber(uniqueEstimate.uniqueCount)} />
          <Stat label="3. active_listings" value={formatNumber(stats.activeCount)} />
          <Stat label="4. corrupt_listing_ids" value={`${confirmedCorrupt.size} confirmed`} />
          <Stat
            label="5. total_monthly_rent (assigned locality)"
            value={
              <>
                {formatCompactINR(rentTotal.total)}
                <div style={{ fontSize: 11, fontWeight: 400 }}>{rentTotal.n} rentals matched</div>
              </>
            }
          />
          <Stat label="6. avg_price_per_sqft_2bhk" value={priceMetric.avg != null ? `₹${priceMetric.avg}` : "—"} />
          <Stat
            label="7. costliest_project"
            value={costliest ? `${costliest.project_id} · ${formatCompactINR(costliest.price_max)}` : "—"}
          />
          <Stat label="8. listings_last_7_days" value={formatNumber(last7Days.length)} />
          <Stat label="9. fake_listing_ids" value={`${confirmedFake.size} confirmed`} />
          <Stat label="10. projects_with_wrong_listing_count" value={formatNumber(wrongCounts.length)} />
        </div>

        <label style={{ display: "block", maxWidth: 320, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Your assigned locality (for Q5)</span>
          <input type="text" value={assignedLocality} onChange={(e) => setAssignedLocality(e.target.value)} />
        </label>
      </div>

      <div className="section-block">
        <h2>Ghost listings — IDs in /v1/listings that 404 on /v1/listing/{'{id}'}</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          A listing that appears in the collection but returns 404 when fetched individually is either
          a real API inconsistency or evidence that the record shouldn't have been in the collection at all.
          Probe a single ID below, or run the batch scan across everything.
        </p>

        {/* Single-ID probe */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            id="ghost-probe-id"
            type="text"
            value={probeId}
            onChange={(e) => setProbeId(e.target.value)}
            placeholder="listing_id to probe"
            style={{ width: 200, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          <button
            id="ghost-probe-btn"
            className="btn secondary"
            onClick={() => probeOne()}
            disabled={probeRunning || !probeId.trim()}
          >
            {probeRunning ? "probing…" : "Probe single ID"}
          </button>
        </div>

        {probeResult && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 14,
              borderLeft: `3px solid ${probeResult.ok ? "var(--accent)" : "#c0392b"}`,
              background: "var(--surface-raised)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            {probeResult.ok ? (
              <>
                <strong>200 OK</strong> — record exists individually.{" "}
                <span style={{ color: "var(--ink-soft)" }}>
                  locality: {probeResult.record?.locality}, price: {probeResult.record?.price}
                </span>
              </>
            ) : (
              <>
                <strong style={{ color: "#c0392b" }}>HTTP {probeResult.status}</strong>{" "}
                <span>detail: "{probeResult.detail}"</span>
                <div style={{ marginTop: 6, color: "var(--ink-soft)" }}>
                  This ID is retrievable from /v1/listings (collection) but fails at
                  /v1/listing/{probeId} — a genuine consistency finding.
                </div>
                <button
                  className="btn secondary"
                  style={{ marginTop: 8, fontSize: 12 }}
                  onClick={() =>
                    setFindingForm((f) => ({
                      ...f,
                      endpoint: `/v1/listing/{id}`,
                      category: "consistency",
                      documented: "Every listing in /v1/listings should be individually retrievable via /v1/listing/{id}.",
                      actual: `HTTP ${probeResult.status} returned for ${probeId}: "${probeResult.detail}". The ID appears normally in /v1/listings but 404s on the individual endpoint.`,
                      how_found: "Clicked a listing row; the detail page 404d. Confirmed via the ghost-listing probe on the Insights screen.",
                      impact: "Detail pages for these listings are broken. May indicate phantom records in the collection index.",
                      evidence: probeId,
                    }))
                  }
                >
                  Pre-fill as finding ↓
                </button>
              </>
            )}
          </div>
        )}

        {/* Batch scan */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button
            id="ghost-scan-btn"
            className="btn secondary"
            onClick={scanRunning ? stopScan : runBatchScan}
            disabled={!listings.records.length}
          >
            {scanRunning
              ? `Stop scan (${scanProgress} / ${listings.records.length} checked)`
              : scanResults
                ? `Re-run scan (${listings.records.length} listings)`
                : `Scan all ${listings.records.length} listings`}
          </button>
          {!listings.records.length && (
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Load listings first.</span>
          )}
        </div>

        {scanRunning && (
          <div className="loading-strip">
            Scanning… {scanProgress} / {listings.records.length} checked
            {scanResults?.ghosts?.length ? ` — ${scanResults.ghosts.length} ghost(s) found so far` : ""}
          </div>
        )}

        {scanResults && !scanRunning && (
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
              Scanned {scanResults.scanned} listings.{" "}
              {scanResults.ghosts.length === 0
                ? "No ghosts found — every ID resolves individually."
                : <strong style={{ color: "#c0392b" }}>{scanResults.ghosts.length} ghost listing(s) found.</strong>}
            </p>
            {scanResults.ghosts.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>listing_id (404s individually)</th>
                    <th>locality</th>
                    <th>price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scanResults.ghosts.map((gid) => {
                    const rec = listings.records.find((l) => l.listing_id === gid);
                    return (
                      <tr key={gid}>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{gid}</td>
                        <td>{rec?.locality ?? "—"}</td>
                        <td>{rec?.price != null ? `₹${formatNumber(rec.price)}` : "—"}</td>
                        <td>
                          <button
                            className="save-btn"
                            onClick={() => { setProbeId(gid); probeOne(gid); }}
                          >
                            Re-probe
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="section-block">
        <h2>Candidate impossible records (for Q4 / data_quality)</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Rule-based candidates only — inspect each before confirming. Checking a row adds it to
          corrupt_listing_ids and excludes it from Q6.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>listing_id</th>
              <th>reasons</th>
            </tr>
          </thead>
          <tbody>
            {corruptCandidates.slice(0, 200).map(({ record, reasons }) => (
              <tr key={record.listing_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={confirmedCorrupt.has(record.listing_id)}
                    onChange={() => toggleCorrupt(record.listing_id)}
                  />
                </td>
                <td>{record.listing_id}</td>
                <td style={{ fontFamily: "var(--font-sans)" }}>{reasons.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {corruptCandidates.length === 0 && listings.status === "ready" && (
          <p style={{ color: "var(--ink-soft)" }}>No candidates from the current rule set. Try a different hypothesis.</p>
        )}
      </div>

      <div className="section-block">
        <h2>Candidate lead-generation contacts (for Q9 / fraud)</h2>
        <label style={{ display: "inline-block", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)", display: "block" }}>
            Flag contacts posting across at least this many distinct apartment names
          </span>
          <input
            type="number"
            style={{ width: 80 }}
            value={contactThreshold}
            onChange={(e) => setContactThreshold(e.target.value)}
          />
        </label>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>contact</th>
              <th>distinct names</th>
              <th>listing count</th>
              <th>listing_ids</th>
            </tr>
          </thead>
          <tbody>
            {suspiciousContacts.slice(0, 100).map((g) => (
              <tr key={g.contact}>
                <td>
                  <input
                    type="checkbox"
                    checked={g.records.every((r) => confirmedFake.has(r.listing_id))}
                    onChange={() => toggleFakeGroup(g.records)}
                  />
                </td>
                <td>{g.contact}</td>
                <td>{g.distinctNames}</td>
                <td>{g.count}</td>
                <td style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}>
                  {g.records.map((r) => r.listing_id).slice(0, 6).join(", ")}
                  {g.records.length > 6 ? "…" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {suspiciousContacts.length === 0 && listings.status === "ready" && (
          <p style={{ color: "var(--ink-soft)" }}>No contacts cross this threshold. Try lowering it, or a different hypothesis entirely.</p>
        )}
      </div>

      <div className="section-block">
        <h2>Projects whose reported count disagrees with reality (Q10)</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>project_id</th>
              <th>reported total_listings</th>
              <th>actual retrievable</th>
            </tr>
          </thead>
          <tbody>
            {wrongCounts.slice(0, 100).map((row) => (
              <tr key={row.project.project_id}>
                <td>{row.project.project_id}</td>
                <td>{row.reported}</td>
                <td>{row.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-block">
        <h2>Findings (Part 3)</h2>
        <div className="filter-bar" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="endpoint, e.g. /v1/listings/{id}"
              value={findingForm.endpoint}
              onChange={(e) => setFindingForm((f) => ({ ...f, endpoint: e.target.value }))}
              style={{ flex: "1 1 220px" }}
            />
            <select
              value={findingForm.category}
              onChange={(e) => setFindingForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="documented behaviour"
            value={findingForm.documented}
            onChange={(e) => setFindingForm((f) => ({ ...f, documented: e.target.value }))}
            rows={2}
          />
          <textarea
            placeholder="actual behaviour"
            value={findingForm.actual}
            onChange={(e) => setFindingForm((f) => ({ ...f, actual: e.target.value }))}
            rows={2}
          />
          <input
            type="text"
            placeholder="how_found"
            value={findingForm.how_found}
            onChange={(e) => setFindingForm((f) => ({ ...f, how_found: e.target.value }))}
          />
          <input
            type="text"
            placeholder="impact"
            value={findingForm.impact}
            onChange={(e) => setFindingForm((f) => ({ ...f, impact: e.target.value }))}
          />
          <input
            type="text"
            placeholder="evidence (comma-separated ids)"
            value={findingForm.evidence}
            onChange={(e) => setFindingForm((f) => ({ ...f, evidence: e.target.value }))}
          />
          <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={addFinding}>
            Add finding
          </button>
        </div>

        <table className="data-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>endpoint</th>
              <th>category</th>
              <th>documented</th>
              <th>actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr key={i}>
                <td>{f.endpoint}</td>
                <td>{f.category}</td>
                <td style={{ fontFamily: "var(--font-sans)" }}>{f.documented}</td>
                <td style={{ fontFamily: "var(--font-sans)" }}>{f.actual}</td>
                <td>
                  <button className="save-btn" onClick={() => removeFinding(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
