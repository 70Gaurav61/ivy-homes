import { api } from "./client";

// FINDING (pagination): Docs say max limit is 200 and response shape is
// { total, page, page_size, results }. Actual max enforced is 50 and response
// shape is { limit, offset, count, total, has_more, results }.
// We use `has_more` to paginate and PAGE_LIMIT=50.

const PAGE_LIMIT = 50; // Actual enforced max (docs claim 200, server caps at 50)
const MAX_PAGES = 500; // Safety cap

/**
 * Pull every record from a paginated collection endpoint.
 *
 * Uses `has_more` (actual field) not page-size comparison to know when to stop.
 * Actual pagination uses `offset` parameter, not `page`.
 *
 * Returns { records, claimedTotal, pages }.
 */
export async function fetchAllPages(path, params = {}, { onProgress } = {}) {
  let offset = 0;
  const records = [];
  let claimedTotal = null;
  let pages = 0;

  while (pages <= MAX_PAGES) {
    const res = await api.get(path, { ...params, offset, limit: PAGE_LIMIT });
    const batch = Array.isArray(res?.results) ? res.results : [];

    if (claimedTotal === null && typeof res?.total === "number") {
      claimedTotal = res.total;
    }
    records.push(...batch);
    pages += 1;
    onProgress?.({ path, page: pages, fetched: records.length, claimedTotal });

    // Use has_more (actual field) as the stop signal
    if (res?.has_more === false || res?.has_more === undefined) break;
    if (batch.length === 0) break;
    offset += PAGE_LIMIT;
  }

  return { records, claimedTotal, pages };
}

export function fetchAllListings(opts) {
  return fetchAllPages("/v1/listings", {}, opts);
}

export function fetchAllRentals(opts) {
  return fetchAllPages("/v1/rentals", {}, opts);
}

export function fetchAllProjects(opts) {
  return fetchAllPages("/v1/projects", {}, opts);
}

// FINDING (missing_endpoint path): API_REFERENCE.md says /v1/listing/{id} (singular).
// Confirmed from Postman that this path works.
export function fetchListing(id) {
  return api.get(`/v1/listing/${encodeURIComponent(id)}`);
}

export function fetchSimilarListings(id) {
  return api.get(`/v1/listings/${encodeURIComponent(id)}/similar`);
}

export function fetchRental(id) {
  return api.get(`/v1/rentals/${encodeURIComponent(id)}`);
}

export function fetchProject(id) {
  return api.get(`/v1/projects/${encodeURIComponent(id)}`);
}

export function fetchAnalyticsSummary() {
  // FINDING (missing_endpoint): /v1/analytics/summary returns 404 — not implemented.
  return api.get("/v1/analytics/summary");
}

// FINDING (missing_endpoint): /v1/favourites returns 404. These wrappers remain
// but DataContext falls back to localStorage when the server returns 404.
export function fetchFavourites() {
  return api.get("/v1/favourites");
}

export function addFavourite(id) {
  return api.post("/v1/favourites", { id });
}

export function removeFavourite(id) {
  return api.delete(`/v1/favourites/${encodeURIComponent(id)}`);
}

export function fetchHealth() {
  return api.get("/health", {}, { auth: false });
}
