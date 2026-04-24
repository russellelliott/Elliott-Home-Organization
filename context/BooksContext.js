import { createContext, useContext, useMemo, useState } from 'react';

const BooksContext = createContext(null);

export function BooksProvider({ initialBooks = [], children }) {
  const [booksById, setBooksById] = useState(() => {
    const map = new Map();
    initialBooks.forEach((book) => map.set(book.id, book));
    return map;
  });

  const [tableState, setTableState] = useState({
    page: 0,
    pageSize: 7,
  });

  const [imageCache, setImageCache] = useState(() => new Set());

  const upsertBooks = (books) => {
    setBooksById((prev) => {
      const next = new Map(prev);
      books.forEach((book) => {
        if (!book?.id) return;
        next.set(book.id, { ...next.get(book.id), ...book });
      });
      return next;
    });
  };

  const cacheImages = (urls) => {
    const safeUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (safeUrls.length === 0) return;

    setImageCache((prev) => {
      const next = new Set(prev);
      safeUrls.forEach((url) => next.add(url));
      return next;
    });
  };

  const value = useMemo(
    () => ({
      books: Array.from(booksById.values()),
      getBook: (id) => booksById.get(id) || null,
      upsertBooks,
      tableState,
      setTableState,
      imageCache,
      cacheImages,
    }),
    [booksById, tableState, imageCache]
  );

  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>;
}

export function useBooks() {
  return useContext(BooksContext);
}
