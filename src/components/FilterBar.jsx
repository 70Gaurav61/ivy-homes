// All filtering happens client-side against the fully-loaded dataset.
// The statement warns filter params may be "accepted and quietly ignored"
// by the server. Filtering locally against in-memory data sidesteps that entirely.

export default function FilterBar({ fields, values, onChange, onReset, resultCount }) {
  return (
    <div className="filter-bar">
      {fields.map((f) => {
        if (f.type === "select") {
          return (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {f.label}
              </span>
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value || undefined)}
                style={{ minWidth: 120 }}
              >
                <option value="">Any</option>
                {(f.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          );
        }
        if (f.type === "number") {
          return (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {f.label}
              </span>
              <input
                type="number"
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                style={{ width: 130 }}
                onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
          );
        }
        return null;
      })}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginLeft: "auto" }}>
        {typeof resultCount === "number" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)", paddingBottom: 2 }}>
            {resultCount.toLocaleString("en-IN")} result{resultCount === 1 ? "" : "s"}
          </span>
        )}
        <button type="button" className="btn secondary" onClick={onReset} style={{ padding: "6px 14px" }}>
          Reset
        </button>
      </div>
    </div>
  );
}
