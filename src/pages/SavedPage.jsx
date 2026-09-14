import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import SaveButton from "../components/SaveButton";
import { formatCompactINR, formatArea } from "../utils/format";

export default function SavedPage() {
  const { favourites, favouritesStatus, ensureFavourites, usingLocalFavs } = useData();

  useEffect(() => {
    ensureFavourites();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="page-header">
        <h1>Saved listings</h1>
        <span className="count">{favourites.length} saved</span>
      </div>

      {/* Show a note when falling back to localStorage */}
      {usingLocalFavs && (
        <div className="notice">
          ⚠ The /v1/favourites API endpoint is not implemented (returns 404). Saved listings
          are stored locally in your browser, per-user, and persist across reloads and re-logins.
        </div>
      )}

      {favouritesStatus === "loading" && (
        <div className="loading-strip">Loading your saved listings…</div>
      )}

      <div className="ledger">
        {favourites.map((l) => (
          <Link key={l.listing_id} to={`/listings/${l.listing_id}`} className="ledger-row">
            <div>
              <div className="title">
                {l.apartment_name || l.locality}
                {l.is_verified && <span className="badge verified">verified</span>}
              </div>
              <div className="meta">
                {l.bedroom} BHK · {l.property_type || "property"} · {l.locality} · {formatArea(l.carpet_area)}
              </div>
            </div>
            <div>
              <div className="price">{formatCompactINR(l.price)}</div>
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <SaveButton listing={l} />
              </div>
            </div>
          </Link>
        ))}

        {favouritesStatus === "ready" && favourites.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>☆</div>
            <div>Nothing saved yet.</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Browse <Link to="/listings">listings</Link> and hit ☆ Save — they'll be here even after you reload or log back in.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
