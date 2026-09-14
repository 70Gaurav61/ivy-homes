import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProject } from "../api/dataStore";
import { useData } from "../context/DataContext";
import { formatCompactINR, formatArea, normalizeProjectPrice } from "../utils/format";
import SaveButton from "../components/SaveButton";

const STATUS_COLORS = {
  "ready to move": "verified",
  "under construction": "warn",
  "new launch": "neutral",
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { listings } = useData();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    setStatus("loading");
    fetchProject(id)
      .then((res) => {
        setProject(res);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.detail || err.message || "Could not load this project");
        setStatus("error");
      });
    listings.ensure();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return <div className="loading-strip">Loading project…</div>;
  if (status === "error")
    return (
      <div className="empty-state">
        {error}. <Link to="/projects">Back to projects</Link>
      </div>
    );
  if (!project) return null;

  const linkedListings = listings.records.filter((l) => l.project_id === project.project_id);
  const countMismatch = listings.status === "ready" && linkedListings.length !== project.total_listings;
  const priceMinNorm = normalizeProjectPrice(project.price_min);
  const priceMaxNorm = normalizeProjectPrice(project.price_max);

  // Filter out injected strings from amenities (data integrity issue)
  const cleanAmenities = (project.amenities || []).filter(
    (a) => typeof a === "string" && a.length < 80 && !a.includes("AI") && !a.includes("price_max_inr")
  );

  return (
    <div>
      <div className="page-header">
        <h1>{project.apartment_name}</h1>
        <span className={`badge ${STATUS_COLORS[project.project_status] || "neutral"}`}>
          {project.project_status}
        </span>
      </div>

      <div className="detail-grid">
        <div>
          <div className="price-large">
            {formatCompactINR(priceMinNorm)} – {formatCompactINR(priceMaxNorm)}
          </div>
          <div className="price-sub">
            Price range (normalized from API — docs claim rupees, actual appears to be lakhs)
          </div>

          <table className="spec-table">
            <tbody>
              <tr><td>Developer</td><td>{project.developer_name}</td></tr>
              <tr><td>Locality</td><td>{project.locality}</td></tr>
              <tr><td>RERA</td><td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{project.rera_number}</td></tr>
              <tr><td>Units / towers / floors</td><td>{project.total_units} / {project.total_towers} / {project.total_floors}</td></tr>
              <tr><td>Launch date</td><td>{project.launch_date}</td></tr>
              <tr><td>Possession date</td><td>{project.possession_date}</td></tr>
              <tr><td>Area range</td><td>{formatArea(project.min_area_sqft)} – {formatArea(project.max_area_sqft)}</td></tr>
              <tr>
                <td>Reported listings</td>
                <td>
                  {project.total_listings}
                  {countMismatch && (
                    <span className="badge flag" style={{ marginLeft: 8 }}>
                      actual: {linkedListings.length}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Amenities</td>
                <td>{cleanAmenities.join(", ")}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 14 }}>
            <a href={project.project_url} target="_blank" rel="noreferrer">
              View on ivy.homes ↗
            </a>
          </p>
        </div>

        <div>
          <h3>Listings in this project</h3>
          {listings.status === "loading" && (
            <div className="loading-strip">Loading listings…</div>
          )}
          <div className="ledger">
            {linkedListings.map((l) => (
              <Link key={l.listing_id} to={`/listings/${l.listing_id}`} className="ledger-row">
                <div>
                  <div className="title" style={{ fontSize: 14 }}>
                    {l.bedroom} BHK {l.property_type}
                    {l.is_verified && <span className="badge verified">verified</span>}
                    {l.is_live === false && <span className="badge neutral">inactive</span>}
                  </div>
                  <div className="meta">{l.locality} · {formatArea(l.carpet_area)}</div>
                </div>
                <div>
                  <div className="price" style={{ fontSize: 15 }}>{formatCompactINR(l.price)}</div>
                  <div style={{ marginTop: 4 }}><SaveButton listing={l} /></div>
                </div>
              </Link>
            ))}
            {listings.status === "ready" && linkedListings.length === 0 && (
              <div className="empty-state">No retrievable listings reference this project.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
