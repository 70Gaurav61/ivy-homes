import { useEffect, useMemo, useState } from "react";
import { useData } from "../context/DataContext";
import FilterBar from "../components/FilterBar";
import usePagination from "../utils/usePagination";
import { formatCompactINR, formatArea, formatDate } from "../utils/format";

const FIELDS = [
  { key: "locality", type: "select", label: "Locality" },
  { key: "bedroom", type: "select", label: "Bedrooms" },
  { key: "furnishing", type: "select", label: "Furnishing" },
  { key: "sort", type: "select", label: "Sort by", options: ["price", "carpet_area", "posted_at"] },
  { key: "order", type: "select", label: "Order", options: ["asc", "desc"] },
];

export default function RentalsPage() {
  const { rentals } = useData();
  const [values, setValues] = useState({});

  useEffect(() => {
    rentals.ensure();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(rentals.records.map((r) => r[key]).filter(Boolean))].sort();
    return {
      locality: uniq("locality"),
      bedroom: uniq("bedroom").map(String),
      furnishing: uniq("furnishing"),
    };
  }, [rentals.records]);

  const fields = FIELDS.map((f) => (f.type === "select" && f.key in options ? { ...f, options: options[f.key] } : f));

  const filtered = useMemo(() => {
    let rows = rentals.records.filter((r) => {
      if (values.locality && r.locality !== values.locality) return false;
      if (values.bedroom && String(r.bedroom) !== String(values.bedroom)) return false;
      if (values.furnishing && r.furnishing !== values.furnishing) return false;
      return true;
    });
    const sortKey = values.sort || "posted_at";
    const order = values.order === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const avNum = Number(av);
      const bvNum = Number(bv);
      if (!Number.isNaN(avNum) && !Number.isNaN(bvNum) && av !== "" && bv !== "") {
        return (avNum - bvNum) * order;
      }
      if (av < bv) return -order;
      if (av > bv) return order;
      return 0;
    });
    return rows;
  }, [rentals.records, values]);

  const { page, totalPages, pageItems, nextPage, prevPage } = usePagination(filtered, 25);

  return (
    <div>
      <div className="page-header">
        <h1>Rentals</h1>
        <span className="count">
          {rentals.status === "loading" ? `loading… ${rentals.progress} pulled` : `${rentals.records.length} retrievable`}
        </span>
      </div>

      <FilterBar
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
        onReset={() => setValues({})}
        resultCount={filtered.length}
      />

      {rentals.status === "loading" && rentals.records.length === 0 && (
        <div className="loading-strip">Pulling the full rentals set…</div>
      )}
      {rentals.status === "error" && <div className="error-text">{rentals.error}</div>}

      <div className="ledger">
        {pageItems.map((r) => (
          <div key={r.listing_id} className="ledger-row" style={{ cursor: "default" }}>
            <div>
              <div className="title">{r.apartment_name || r.title || r.locality}</div>
              <div className="meta">
                {r.bedroom} BHK · {r.locality} · {formatArea(r.carpet_area)} · posted {formatDate(r.posted_at)}
              </div>
            </div>
            <div>
              <div className="price">
                {formatCompactINR(r.price)}
                <small>/month · deposit {formatCompactINR(r.deposit)}</small>
              </div>
            </div>
          </div>
        ))}
        {rentals.status === "ready" && filtered.length === 0 && (
          <div className="empty-state">No rentals match these filters.</div>
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
