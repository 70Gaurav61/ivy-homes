import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchListing, fetchSimilarListings } from "../api/dataStore";
import SaveButton from "../components/SaveButton";
import { formatCompactINR, formatArea, formatDate } from "../utils/format";

export default function ListingDetailPage() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    fetchListing(id)
      .then((res) => {
        setListing(res);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.detail || err.message || "Could not load this listing");
        setStatus("error");
      });
    fetchSimilarListings(id)
      .then((res) => setSimilar(Array.isArray(res) ? res : res?.results || []))
      .catch(() => setSimilar([]));
  }, [id]);

  if (status === "loading") return <div className="loading-strip">Loading listing…</div>;
  if (status === "error")
    return (
      <div className="empty-state">
        {error}. <Link to="/listings">Back to listings</Link>
      </div>
    );
  if (!listing) return null;

  return (
    <div>
      <div className="page-header">
        <h1>{listing.apartment_name || listing.locality}</h1>
        <SaveButton listing={listing} />
      </div>

      <div className="detail-grid">
        <div>
          <div className="price" style={{ fontSize: 28, marginBottom: 4 }}>
            {formatCompactINR(listing.price)}
          </div>
          <div style={{ color: "var(--ink-soft)", marginBottom: 16 }}>
            {listing.bedroom} BHK {listing.property_type} in {listing.locality}
            {listing.is_verified && <span className="badge verified">verified</span>}
          </div>
          <p>{listing.description}</p>

          <table className="spec-table">
            <tbody>
              <tr>
                <td>Carpet area</td>
                <td>{formatArea(listing.carpet_area)}</td>
              </tr>
              <tr>
                <td>Super built-up area</td>
                <td>{formatArea(listing.super_built_up_area)}</td>
              </tr>
              <tr>
                <td>Bathrooms / balconies</td>
                <td>
                  {listing.bathroom} / {listing.balcony}
                </td>
              </tr>
              <tr>
                <td>Floor</td>
                <td>
                  {listing.floor} of {listing.total_floors}
                </td>
              </tr>
              <tr>
                <td>Furnishing</td>
                <td>{listing.furnishing}</td>
              </tr>
              <tr>
                <td>Facing</td>
                <td>{listing.facing_direction}</td>
              </tr>
              <tr>
                <td>Parking</td>
                <td>{listing.covered_parking}</td>
              </tr>
              <tr>
                <td>Posted</td>
                <td>{formatDate(listing.posted_at)}</td>
              </tr>
              <tr>
                <td>Listing ID</td>
                <td>{listing.listing_id}</td>
              </tr>
              {listing.project_id && (
                <tr>
                  <td>Project</td>
                  <td>
                    <Link to={`/projects/${listing.project_id}`}>{listing.project_id}</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h3>Posted by</h3>
          <table className="spec-table">
            <tbody>
              <tr>
                <td>Name</td>
                <td>{listing.posted_by_name}</td>
              </tr>
              <tr>
                <td>Role</td>
                <td>{listing.posted_by}</td>
              </tr>
              <tr>
                <td>Contact</td>
                <td>{listing.posted_by_contact}</td>
              </tr>
            </tbody>
          </table>

          {listing.listing_url && (
            <p style={{ marginTop: 16 }}>
              <a href={listing.listing_url} target="_blank" rel="noreferrer">
                View original on {listing.website}
              </a>
            </p>
          )}

          {similar.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>Similar listings</h3>
              <div className="ledger">
                {similar.slice(0, 5).map((s) => (
                  <Link key={s.listing_id} to={`/listings/${s.listing_id}`} className="ledger-row">
                    <div className="title" style={{ fontSize: 15 }}>
                      {s.apartment_name || s.locality}
                    </div>
                    <div className="price" style={{ fontSize: 14 }}>
                      {formatCompactINR(s.price)}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
