import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import FilterBar from "../components/FilterBar";
import usePagination from "../utils/usePagination";
import { formatCompactINR, formatArea, normalizeProjectPrice } from "../utils/format";

const FIELDS = [
  { key: "locality", type: "select", label: "Locality" },
  { key: "project_status", type: "select", label: "Status" },
  { key: "developer_name", type: "select", label: "Developer" },
  { key: "sort", type: "select", label: "Sort by", options: ["price_min", "price_max", "launch_date", "total_units", "total_listings"] },
  { key: "order", type: "select", label: "Order", options: ["asc", "desc"] },
];

const STATUS_COLORS = {
  "ready to move": "verified",
  "under construction": "warn",
  "new launch": "neutral",
};

export default function ProjectsPage() {
  const { projects } = useData();
  const [values, setValues] = useState({});

  useEffect(() => {
    projects.ensure();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(projects.records.map((p) => p[key]).filter(Boolean))].sort();
    return {
      locality: uniq("locality"),
      project_status: uniq("project_status"),
      developer_name: uniq("developer_name"),
    };
  }, [projects.records]);

  const fields = FIELDS.map((f) => (f.type === "select" && f.key in options ? { ...f, options: options[f.key] } : f));

  const enriched = useMemo(
    () =>
      projects.records.map((p) => ({
        ...p,
        _price_min_norm: normalizeProjectPrice(p.price_min),
        _price_max_norm: normalizeProjectPrice(p.price_max),
      })),
    [projects.records]
  );

  const filtered = useMemo(() => {
    let rows = enriched.filter((p) => {
      if (values.locality && p.locality !== values.locality) return false;
      if (values.project_status && p.project_status !== values.project_status) return false;
      if (values.developer_name && p.developer_name !== values.developer_name) return false;
      return true;
    });
    const sortKey = values.sort || "launch_date";
    const order = values.order === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      // Use normalized price for sort
      if (sortKey === "price_min") { av = a._price_min_norm; bv = b._price_min_norm; }
      if (sortKey === "price_max") { av = a._price_max_norm; bv = b._price_max_norm; }
      
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      const avNum = Number(av);
      const bvNum = Number(bv);
      if (!Number.isNaN(avNum) && !Number.isNaN(bvNum) && av !== "" && bv !== "") {
        return (avNum - bvNum) * order;
      }
      
      if (av === bv) return 0;
      return av > bv ? order : -order;
    });
    return rows;
  }, [enriched, values]);

  const { page, totalPages, pageItems, nextPage, prevPage } = usePagination(filtered, 25);

  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        <span className="count">
          {projects.status === "loading"
            ? `loading… ${projects.progress} pulled`
            : `${projects.records.length} projects`}
        </span>
      </div>

      {/* Price unit notice */}
      <div className="notice">
        ⚠ Docs claim price_min/price_max are in rupees — actual values appear to be in lakhs.
        Prices shown below are normalized (×1L).
      </div>

      <FilterBar
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
        onReset={() => setValues({})}
        resultCount={filtered.length}
      />

      {projects.status === "loading" && projects.records.length === 0 && (
        <div className="loading-strip">Pulling the full projects dataset…</div>
      )}
      {projects.status === "error" && <div className="error-text">{projects.error}</div>}

      <div className="ledger">
        {pageItems.map((p) => (
          <Link key={p.project_id} to={`/projects/${p.project_id}`} className="ledger-row">
            <div style={{ flex: 1 }}>
              <div className="title">
                {p.apartment_name}
                <span className={`badge ${STATUS_COLORS[p.project_status] || "neutral"}`}>
                  {p.project_status}
                </span>
              </div>
              <div className="meta">
                {p.developer_name} · {p.locality} · {p.total_units} units ·{" "}
                {p.total_listings} listed · RERA: {p.rera_number}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="price">
                {formatCompactINR(p._price_min_norm)} – {formatCompactINR(p._price_max_norm)}
              </div>
              <small style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>
                {formatArea(p.min_area_sqft)} – {formatArea(p.max_area_sqft)}
              </small>
            </div>
          </Link>
        ))}
        {projects.status === "ready" && filtered.length === 0 && (
          <div className="empty-state">No projects match these filters.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button className="btn secondary" onClick={prevPage} disabled={page === 1}>Previous</button>
          <span style={{ alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <button className="btn secondary" onClick={nextPage} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  );
}
