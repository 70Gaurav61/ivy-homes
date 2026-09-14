import { useMemo, useState, useEffect } from "react";

export default function usePagination(items, pageSize = 24) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Reset to page 1 whenever the items array reference changes (i.e. when
  // filters are applied / cleared). Using items.length alone missed the case
  // where the filtered set changes but happens to have the same count.
  useEffect(() => {
    setPage(1);
  }, [items]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    totalPages,
    pageItems,
    nextPage: () => setPage((p) => Math.min(totalPages, p + 1)),
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    setPage,
  };
}
