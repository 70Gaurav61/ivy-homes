import { createContext, useContext, useRef, useState, useCallback, useMemo } from "react";
import {
  fetchAllListings,
  fetchAllRentals,
  fetchAllProjects,
} from "../api/dataStore";
import { useAuth } from "./AuthContext";

const DataContext = createContext(null);

// Normalise the unique ID of a listing/favourite regardless of which field name the API uses.
export function listingId(item) {
  return item?.listing_id ?? item?.id ?? null;
}

// LocalStorage key for favourites (per-user)
function favKey(email) {
  return `ivy_favs_${email || "anon"}_v1`;
}

function loadLocalFavs(email) {
  try {
    return JSON.parse(localStorage.getItem(favKey(email))) || [];
  } catch {
    return [];
  }
}

function saveLocalFavs(email, favs) {
  localStorage.setItem(favKey(email), JSON.stringify(favs));
}

function useCollection(fetcher) {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [meta, setMeta] = useState({ claimedTotal: null, pages: 0 });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const inFlight = useRef(null);

  const ensure = useCallback(
    (force = false) => {
      if (!force && (status === "ready" || status === "loading")) return inFlight.current;
      setStatus("loading");
      setError(null);
      const p = fetcher({
        onProgress: ({ fetched }) => setProgress(fetched),
      })
        .then(({ records, claimedTotal, pages }) => {
          setRecords(records);
          setMeta({ claimedTotal, pages });
          setStatus("ready");
        })
        .catch((err) => {
          setStatus("error");
          setError(err.detail || err.message || "Failed to load");
        });
      inFlight.current = p;
      return p;
    },
    [fetcher, status]
  );

  return { records, status, meta, progress, error, ensure };
}

export function DataProvider({ children }) {
  const { session } = useAuth();
  const userEmail = session?.user?.email || "";

  const listings = useCollection(fetchAllListings);
  const rentals = useCollection(fetchAllRentals);
  const projects = useCollection(fetchAllProjects);

  // FINDING: /v1/favourites returns 404 — not implemented on the server.
  // We skip the API entirely and always use localStorage for favourites.
  // This avoids a stale-closure race where usingLocalFavs was false on first
  // click (API path), then the catch set it true, but the second click on a
  // different item still had the old closure — causing all buttons to toggle.
  const [favourites, setFavourites] = useState(() => loadLocalFavs(userEmail));
  const [favouritesStatus, setFavouritesStatus] = useState("idle");
  const usingLocalFavs = true; // always — API endpoint is not implemented

  const favIds = useMemo(
    () => new Set(favourites.map((f) => listingId(f)).filter(Boolean)),
    [favourites]
  );

  const ensureFavourites = useCallback(
    (force = false) => {
      if (!force && (favouritesStatus === "ready" || favouritesStatus === "loading")) return;
      // Load fresh from localStorage (API is not implemented)
      setFavourites(loadLocalFavs(userEmail));
      setFavouritesStatus("ready");
    },
    [favouritesStatus, userEmail]
  );

  const toggleFavourite = useCallback(
    (listing) => {
      const id = listingId(listing);
      if (!id) return; // guard against listings with no usable ID

      // Pure localStorage path — use functional updater to always read
      // the latest state and never risk a stale-closure snapshot.
      setFavourites((prev) => {
        const isSaved = prev.some((f) => listingId(f) === id);
        const next = isSaved
          ? prev.filter((f) => listingId(f) !== id)
          : [...prev, listing];
        saveLocalFavs(userEmail, next);
        return next;
      });
    },
    [userEmail]
  );

  const value = {
    listings,
    rentals,
    projects,
    favourites,
    favIds,
    favouritesStatus,
    usingLocalFavs,
    ensureFavourites,
    toggleFavourite,
    listingId,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
