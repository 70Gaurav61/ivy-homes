export function formatINR(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompactINR(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  if (amount >= 1000) return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
  return `₹${amount}`;
}

export function formatArea(sqft) {
  if (sqft === null || sqft === undefined) return "—";
  return `${new Intl.NumberFormat("en-IN").format(sqft)} sqft`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

export function formatNumber(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN").format(n);
}

/**
 * Normalize project price fields to rupees.
 *
 * FINDING (units): /v1/projects price_min and price_max appear to be in lakhs
 * for some records (values like 80.0, 38.5) and crores for others (3.22, 1.4).
 * The API_REFERENCE.md states "price_min and price_max are in rupees" but observed
 * values are clearly not rupees.
 *
 * Heuristic: values < 1000 are treated as lakhs (×100000). Values ≥ 1000 but
 * < 100000 might be hundreds of thousands. Values ≥ 100000 are already rupees.
 * We apply: if value < 1000 → multiply by 100000 (treat as lakhs).
 */
export function normalizeProjectPrice(rawPrice) {
  if (rawPrice === null || rawPrice === undefined) return null;
  const v = Number(rawPrice);
  if (Number.isNaN(v)) return null;
  // If value is small (< 1000), it's in lakhs
  if (v < 1000) return Math.round(v * 100000);
  // Already in rupees
  return Math.round(v);
}
