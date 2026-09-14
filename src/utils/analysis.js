// Every function here produces a CANDIDATE list or number from a hypothesis,
// not a verified answer. The Insights page surfaces underlying records next
// to every number so you can eyeball them before trusting them.

import { normalizeProjectPrice } from "./format";

export function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Impossible-property heuristics (candidates for Q4 / data_quality findings).
 */
export function findCorruptListings(listings) {
  const flagged = [];
  for (const l of listings) {
    const reasons = [];
    if (l.carpet_area != null && l.super_built_up_area != null && l.carpet_area > l.super_built_up_area) {
      reasons.push("carpet_area > super_built_up_area");
    }
    if (
      l.property_type !== "plot" &&
      l.bedroom != null && l.bedroom <= 0 && l.property_type !== "plot"
    ) {
      reasons.push("bedroom <= 0 (non-plot)");
    }
    if (l.bathroom != null && l.bedroom != null && l.bathroom > l.bedroom + 4) {
      reasons.push("bathroom implausible vs bedroom");
    }
    if (l.floor != null && l.total_floors != null && l.total_floors > 0 && l.floor > l.total_floors) {
      reasons.push("floor > total_floors");
    }
    if (l.price != null && l.price <= 0) reasons.push("price <= 0");
    if (l.carpet_area != null && l.carpet_area <= 0 && l.property_type !== "plot") {
      reasons.push("carpet_area <= 0 (non-plot)");
    }
    if (
      l.latitude != null &&
      l.longitude != null &&
      (Math.abs(l.latitude) > 90 || Math.abs(l.longitude) > 180 || (l.latitude === 0 && l.longitude === 0))
    ) {
      reasons.push("coordinates out of range / null island");
    }
    if (reasons.length) flagged.push({ record: l, reasons });
  }
  return flagged;
}

/**
 * Lead-generation / not-genuine heuristic (candidates for Q9 / fraud).
 * Same contact number posted across many distinct apartment names = suspicious.
 */
export function findSuspiciousContacts(listings, { minDistinctProjects = 4 } = {}) {
  const byContact = new Map();
  for (const l of listings) {
    const contact = l.posted_by_contact;
    if (!contact) continue;
    if (!byContact.has(contact)) byContact.set(contact, []);
    byContact.get(contact).push(l);
  }
  const flagged = [];
  for (const [contact, group] of byContact.entries()) {
    const distinctNames = new Set(group.map((l) => l.apartment_name || l.locality));
    if (distinctNames.size >= minDistinctProjects) {
      flagged.push({ contact, count: group.length, distinctNames: distinctNames.size, records: group });
    }
  }
  return flagged.sort((a, b) => b.count - a.count);
}

/**
 * Duplicate-property grouping (for Q2 / duplicates findings).
 * Groups by exact lat/long.
 */
export function groupDuplicateProperties(listings) {
  const groups = new Map();
  for (const l of listings) {
    const lat = l.latitude != null ? l.latitude : "?";
    const lng = l.longitude != null ? l.longitude : "?";
    const key = `${lat}|${lng}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return groups;
}

export function estimateUniqueProperties(listings) {
  const groups = groupDuplicateProperties(listings);
  return { uniqueCount: groups.size, groups };
}

/** Q6: mean price/sqft for live 2BHK listings, excluding given ids. */
export function avgPricePerSqft2BHK(listings, excludeIds = new Set()) {
  const eligible = listings.filter(
    (l) =>
      l.is_live === true &&
      l.bedroom === 2 &&
      !excludeIds.has(l.listing_id) &&
      l.carpet_area > 0
  );
  const ratios = eligible.map((l) => l.price / l.carpet_area);
  const avg = mean(ratios);
  return { avg: avg != null ? Math.round(avg * 100) / 100 : null, n: eligible.length };
}

/**
 * Q7: project with the highest price_max.
 * FINDING: price_max in projects API is NOT in rupees (contrary to docs) — it
 * appears to be in lakhs for values < 1000. We normalize before comparing.
 */
export function costliestProject(projects) {
  if (!projects.length) return null;
  return projects.reduce((best, p) => {
    const pMaxNorm = normalizeProjectPrice(p.price_max) ?? -Infinity;
    const bestMaxNorm = normalizeProjectPrice(best?.price_max) ?? -Infinity;
    return pMaxNorm > bestMaxNorm ? p : best;
  }, null);
}

/** Q8: listings posted in [REFERENCE - 7d, REFERENCE) IST. */
export function listingsInLast7Days(listings, referenceIso = "2026-09-10T00:00:00+05:30") {
  const ref = new Date(referenceIso).getTime();
  const start = ref - 7 * 24 * 60 * 60 * 1000;
  return listings.filter((l) => {
    if (!l.posted_at) return false;
    const t = new Date(l.posted_at).getTime();
    return t >= start && t < ref;
  });
}

/** Q10: projects whose reported total_listings disagrees with actual count. */
export function projectsWithWrongListingCount(projects, listings) {
  const actualCounts = new Map();
  for (const l of listings) {
    if (!l.project_id) continue;
    actualCounts.set(l.project_id, (actualCounts.get(l.project_id) || 0) + 1);
  }
  return projects
    .map((p) => ({
      project: p,
      reported: p.total_listings,
      actual: actualCounts.get(p.project_id) || 0,
    }))
    .filter((row) => row.reported !== row.actual);
}

/** Q5: sum of monthly rent for a given locality among retrievable rentals. */
export function totalMonthlyRentForLocality(rentals, locality) {
  if (!locality) return { total: 0, n: 0 };
  const norm = locality.trim().toLowerCase();
  const matches = rentals.filter((r) => (r.locality || "").toLowerCase() === norm);
  return { total: matches.reduce((sum, r) => sum + (r.price || 0), 0), n: matches.length };
}

export function summaryStats(listings) {
  const active = listings.filter((l) => l.is_live === true);
  const byLocality = new Map();
  const byBhk = new Map();
  for (const l of listings) {
    byLocality.set(l.locality, (byLocality.get(l.locality) || 0) + 1);
    byBhk.set(l.bedroom, (byBhk.get(l.bedroom) || 0) + 1);
  }
  return {
    total: listings.length,
    activeCount: active.length,
    medianPrice: median(listings.map((l) => l.price).filter(Boolean)),
    byLocality: [...byLocality.entries()].sort((a, b) => b[1] - a[1]),
    byBhk: [...byBhk.entries()].sort((a, b) => a[0] - b[0]),
  };
}
