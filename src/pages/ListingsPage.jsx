import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import FilterBar from "../components/FilterBar";
import SaveButton from "../components/SaveButton";
import usePagination from "../utils/usePagination";
import { formatCompactINR, formatArea, formatDate } from "../utils/format";

const FIELDS = [
  { key: "locality", type: "select", label: "Locality" },
  { key: "bedroom", type: "select", label: "Bedrooms" },
  { key: "property_type", type: "select", label: "Type" },
  { key: "furnishing", type: "select", label: "Furnishing" },
  { key: "min_price", type: "number", label: "Min price (₹)", placeholder: "0" },
  { key: "max_price", type: "number", label: "Max price (₹)", placeholder: "any" },
  { key: "sort", type: "select", label: "Sort by", options: ["price", "carpet_area", "posted_at", "bedroom"] },
  { key: "order", type: "select", label: "Order", options: ["asc", "desc"] },
];

export default function ListingsPage() {
  const { listings } = useData();
  const [values, setValues] = useState({});

  useEffect(() => {
    listings.ensure();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(listings.records.map((l) => l[key]).filter(Boolean))].sort();
    return {
      locality: uniq("locality"),
      bedroom: uniq("bedroom").map(String),
      property_type: uniq("property_type"),
      furnishing: uniq("furnishing"),
    };
  }, [listings.records]);

  const fields = FIELDS.map((f) =>
    f.type === "select" && f.key in options ? { ...f, options: options[f.key] } : f
  );

  const filtered = useMemo(() => {
    let rows = listings.records.filter((l) => {
      if (values.locality && l.locality !== values.locality) return false;
      if (values.bedroom && String(l.bedroom) !== String(values.bedroom)) return false;
      if (values.property_type && l.property_type !== values.property_type) return false;
      if (values.furnishing && l.furnishing !== values.furnishing) return false;
      if (Number.isFinite(values.min_price)) {
        if (l.price == null || l.price < values.min_price) return false;
      }
      if (Number.isFinite(values.max_price)) {
        if (l.price == null || l.price > values.max_price) return false;
      }
      return true;
    });
    const sortKey = values.sort || "posted_at";
    const order = values.order === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Nulls / undefined always sink to the bottom regardless of order
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      // Numeric fields: parse to number to avoid lexicographic issues ("1000" < "200")
      const avNum = Number(av);
      const bvNum = Number(bv);
      if (!Number.isNaN(avNum) && !Number.isNaN(bvNum) && av !== "" && bv !== "") {
        return (avNum - bvNum) * order;
      }
      // Strings (including ISO date strings): lexicographic comparison
      if (av < bv) return -order;
      if (av > bv) return order;
      return 0;
    });
    return rows;
  }, [listings.records, values]);

  const { page, totalPages, pageItems, nextPage, prevPage } = usePagination(filtered, 25);

  const handleChange = (key, val) => setValues((v) => ({ ...v, [key]: val }));
  const handleReset = () => setValues({});

  return (
    <div>
      <div className="page-header">
        <h1>Listings</h1>
        <span className="count">
          {listings.status === "loading"
            ? `loading… ${listings.progress} pulled`
            : `${listings.records.length} retrievable`}
        </span>
      </div>

      <FilterBar fields={fields} values={values} onChange={handleChange} onReset={handleReset} resultCount={filtered.length} />

      {listings.status === "loading" && listings.records.length === 0 && (
        <div className="loading-strip">Pulling the full listings set once, so filters and sort stay correct locally…</div>
      )}
      {listings.status === "error" && <div className="error-text">{listings.error}</div>}

      <div className="ledger">
        {pageItems.map((l) => (
          <Link key={l.listing_id} to={`/listings/${l.listing_id}`} className="ledger-row">
            <div>
              <div className="title">
                {l.apartment_name || l.locality}
                {l.is_verified && <span className="badge verified">verified</span>}
                {l.is_live === false && <span className="badge neutral">inactive</span>}
              </div>
              <div className="meta">
                {l.bedroom} BHK {l.property_type} · {l.locality} · {formatArea(l.carpet_area)} · posted{" "}
                {formatDate(l.posted_at)}
              </div>
            </div>
            <div>
              <div className="price">
                {formatCompactINR(l.price)}
                <small>{l.listing_id}</small>
              </div>
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <SaveButton listing={l} />
              </div>
            </div>
          </Link>
        ))}
        {listings.status === "ready" && filtered.length === 0 && (
          <div className="empty-state">No listings match these filters. Try resetting them.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button className="btn secondary" onClick={prevPage} disabled={page === 1}>
            Previous
          </button>
          <span style={{ alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <button className="btn secondary" onClick={nextPage} disabled={page === totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
