import { useState } from "react";
import { useData } from "../context/DataContext";
import { listingId } from "../context/DataContext";

export default function SaveButton({ listing }) {
  const { favIds, toggleFavourite } = useData();
  const [busy, setBusy] = useState(false);
  const saved = favIds.has(listingId(listing));

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      toggleFavourite(listing);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={`save-btn ${saved ? "saved" : ""}`} onClick={handleClick} disabled={busy}>
      {busy ? "…" : saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}
