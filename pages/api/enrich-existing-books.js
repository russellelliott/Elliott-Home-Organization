import { adminDb } from '../../lib/firebase-admin';

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))];
}

function normalizeExistingSourceFields(data) {
  const legacySources = Array.isArray(data.sources) ? data.sources : [];
  const urlSources = [
    ...legacySources.filter(isHttpUrl),
    data.source,
    data.sourceUrl,
    data.sourceLink
  ].filter(isHttpUrl);

  const imageSources = [
    ...(Array.isArray(data.imageSources) ? data.imageSources : []),
    ...legacySources.filter(v => typeof v === 'string' && !isHttpUrl(v))
  ].filter(Boolean);

  return {
    urlSources: uniqueStrings(urlSources),
    imageSources: uniqueStrings(imageSources)
  };
}

function extractBookId(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return null;

  const googleMatch = sourceUrl.match(/(?:id=|volumes\/)([a-zA-Z0-9_-]+)/);
  if (googleMatch) return { source: 'Google Books', id: googleMatch[1] };

  const olMatch = sourceUrl.match(/openlibrary\.org\/(works|books)\/(OL\d+[WM])/);
  if (olMatch) return { source: 'Open Library', id: `${olMatch[1]}/${olMatch[2]}` };

  return null;
}

function getGoogleCoverUrls(volumeInfo) {
  const imageLinks = volumeInfo?.imageLinks || {};
  const coverUrls = [];
  if (imageLinks.extraLarge) coverUrls.push(imageLinks.extraLarge);
  if (imageLinks.large) coverUrls.push(imageLinks.large);
  if (imageLinks.medium) coverUrls.push(imageLinks.medium);
  if (imageLinks.small) coverUrls.push(imageLinks.small);
  if (imageLinks.thumbnail) coverUrls.push(imageLinks.thumbnail);
  if (imageLinks.smallThumbnail) coverUrls.push(imageLinks.smallThumbnail);
  return coverUrls;
}

function getOpenLibraryCoverUrls(coverId) {
  if (!coverId) return [];
  return [
    `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
    `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
    `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`
  ];
}

function asAuthorArray(authors) {
  if (Array.isArray(authors)) return authors.filter(Boolean);
  if (typeof authors === 'string' && authors.trim()) return [authors.trim()];
  return [];
}

function mergeAuthors(...authorLists) {
  return uniqueStrings(authorLists.flatMap(list => asAuthorArray(list)));
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return value > 0;
  return !(value === null || value === undefined || (typeof value === 'string' && value.trim() === ''));
}

function getFieldValue(data, updateObj, fieldName) {
  return updateObj[fieldName] !== undefined ? updateObj[fieldName] : data[fieldName];
}

function getMissingFlags(data, updateObj = {}) {
  const coverImages = getFieldValue(data, updateObj, 'coverImages');
  const authors = getFieldValue(data, updateObj, 'authors') || getFieldValue(data, updateObj, 'author');
  const publicationDate = getFieldValue(data, updateObj, 'publicationDate') || getFieldValue(data, updateObj, 'publishedDate');

  return {
    coverImages: !hasValue(coverImages),
    isbn: !hasValue(getFieldValue(data, updateObj, 'isbn')),
    publisher: !hasValue(getFieldValue(data, updateObj, 'publisher')),
    publicationDate: !hasValue(publicationDate),
    authors: !hasValue(authors),
    pageCount: !hasValue(getFieldValue(data, updateObj, 'pageCount')),
    description: !hasValue(getFieldValue(data, updateObj, 'description'))
  };
}

function fillMissingFields(data, updateObj, externalData) {
  if (!externalData) return;

  const missing = getMissingFlags(data, updateObj);

  if (missing.coverImages && hasValue(externalData.coverUrls)) {
    updateObj.coverImages = externalData.coverUrls;
    updateObj.coverImage = externalData.coverUrls[0] || null;
  }
  if (missing.isbn && hasValue(externalData.isbn)) {
    updateObj.isbn = externalData.isbn;
  }
  if (missing.publisher && hasValue(externalData.publisher)) {
    updateObj.publisher = externalData.publisher;
  }
  if (missing.publicationDate && hasValue(externalData.publicationDate)) {
    updateObj.publicationDate = externalData.publicationDate;
    updateObj.publishedDate = externalData.publicationDate;
  }
  if (missing.authors && hasValue(externalData.authors)) {
    updateObj.authors = asAuthorArray(externalData.authors);
  }
  if (missing.pageCount && hasValue(externalData.pageCount)) {
    updateObj.pageCount = externalData.pageCount;
  }
  if (missing.description && hasValue(externalData.description)) {
    updateObj.description = externalData.description;
  }
}

async function fetchGoogleByVolumeId(id) {
  if (!id) return null;
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const vol = data.volumeInfo || {};

  return {
    source: 'Google Books',
    sourceUrl: vol.infoLink || vol.canonicalVolumeLink || `https://books.google.com/books?id=${id}`,
    title: vol.title || null,
    authors: vol.authors || [],
    isbn: vol.industryIdentifiers?.find(x => x.type === 'ISBN_13')?.identifier ||
      vol.industryIdentifiers?.find(x => x.type === 'ISBN_10')?.identifier || null,
    publisher: vol.publisher || null,
    publicationDate: vol.publishedDate || null,
    description: vol.description || null,
    pageCount: vol.pageCount || null,
    coverUrls: getGoogleCoverUrls(vol)
  };
}

async function fetchGoogleByISBN(isbn) {
  if (!isbn) return null;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&maxResults=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) return null;
  const vol = item.volumeInfo || {};

  return {
    source: 'Google Books',
    sourceUrl: vol.infoLink || vol.canonicalVolumeLink || null,
    title: vol.title || null,
    authors: vol.authors || [],
    isbn: vol.industryIdentifiers?.find(x => x.type === 'ISBN_13')?.identifier ||
      vol.industryIdentifiers?.find(x => x.type === 'ISBN_10')?.identifier || null,
    publisher: vol.publisher || null,
    publicationDate: vol.publishedDate || null,
    description: vol.description || null,
    pageCount: vol.pageCount || null,
    coverUrls: getGoogleCoverUrls(vol)
  };
}

async function fetchGoogleByTitleAuthor(title, author) {
  if (!title) return null;
  let query = `intitle:"${title}"`;
  if (author) query += `+inauthor:"${author}"`;

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&maxResults=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) return null;

  const vol = item.volumeInfo || {};
  return {
    source: 'Google Books',
    sourceUrl: vol.infoLink || vol.canonicalVolumeLink || null,
    title: vol.title || null,
    authors: vol.authors || [],
    isbn: vol.industryIdentifiers?.find(x => x.type === 'ISBN_13')?.identifier ||
      vol.industryIdentifiers?.find(x => x.type === 'ISBN_10')?.identifier || null,
    publisher: vol.publisher || null,
    publicationDate: vol.publishedDate || null,
    description: vol.description || null,
    pageCount: vol.pageCount || null,
    coverUrls: getGoogleCoverUrls(vol)
  };
}

async function fetchOpenLibraryByWorkOrBookId(id) {
  if (!id) return null;
  const candidate = id.endsWith('.json') ? id : `${id}.json`;
  const url = `https://openlibrary.org/${candidate}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
  });
  if (!res.ok) return null;
  const data = await res.json();

  const coverId = data.covers && data.covers.length > 0 ? data.covers[0] : null;

  return {
    source: 'Open Library',
    sourceUrl: `https://openlibrary.org/${id}`,
    title: data.title || null,
    authors: [],
    isbn: data.isbn_13?.[0] || data.isbn_10?.[0] || null,
    publisher: data.publishers?.[0] || null,
    publicationDate: data.publish_date || null,
    description: typeof data.description === 'string' ? data.description : data.description?.value || null,
    pageCount: data.number_of_pages || data.number_of_pages_median || null,
    coverUrls: getOpenLibraryCoverUrls(coverId)
  };
}

async function fetchOpenLibraryByISBN(isbn) {
  if (!isbn) return null;
  const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data.docs && data.docs[0];
  if (!doc) return null;

  return {
    source: 'Open Library',
    sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : null,
    title: doc.title || null,
    authors: doc.author_name || [],
    isbn: doc.isbn ? (doc.isbn.find(v => v && v.length === 13) || doc.isbn[0]) : null,
    publisher: doc.publisher?.[0] || null,
    publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
    description: null,
    pageCount: doc.number_of_pages || doc.number_of_pages_median || null,
    coverUrls: doc.cover_i ? getOpenLibraryCoverUrls(doc.cover_i) : []
  };
}

async function fetchOpenLibraryByTitleAuthor(title, author) {
  if (!title) return null;

  let query = `title=${encodeURIComponent(title)}`;
  if (author) query += `&author=${encodeURIComponent(author)}`;

  const url = `https://openlibrary.org/search.json?${query}&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data.docs && data.docs[0];
  if (!doc) return null;

  return {
    source: 'Open Library',
    sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : null,
    title: doc.title || null,
    authors: doc.author_name || [],
    isbn: doc.isbn ? (doc.isbn.find(v => v && v.length === 13) || doc.isbn[0]) : null,
    publisher: doc.publisher?.[0] || null,
    publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
    description: null,
    pageCount: doc.number_of_pages || doc.number_of_pages_median || null,
    coverUrls: doc.cover_i ? getOpenLibraryCoverUrls(doc.cover_i) : []
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const booksRef = adminDb.collection('books');
    const snapshot = await booksRef.get();

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();

        const normalizedSources = normalizeExistingSourceFields(data);
        const sourceIds = normalizedSources.urlSources
          .map(extractBookId)
          .filter(Boolean);

        const googleSourceId = sourceIds.find(s => s.source === 'Google Books')?.id;
        const openLibrarySourceId = sourceIds.find(s => s.source === 'Open Library')?.id;

        let googleData = null;
        if (googleSourceId) {
          googleData = await fetchGoogleByVolumeId(googleSourceId);
        }
        if (!googleData && data.isbn) {
          googleData = await fetchGoogleByISBN(data.isbn);
        }
        if (!googleData) {
          const authorHint = Array.isArray(data.authors) ? data.authors[0] : (data.authors || data.author || null);
          googleData = await fetchGoogleByTitleAuthor(data.title, authorHint);
        }

        const updateObj = {};
        fillMissingFields(data, updateObj, googleData);

        let openLibraryData = null;
        const stillMissingAfterGoogle = getMissingFlags(data, updateObj);
        const shouldQueryOpenLibrary = Object.values(stillMissingAfterGoogle).some(Boolean);

        if (shouldQueryOpenLibrary) {
          if (openLibrarySourceId) {
            openLibraryData = await fetchOpenLibraryByWorkOrBookId(openLibrarySourceId);
          }

          if (!openLibraryData) {
            const isbnToUse = getFieldValue(data, updateObj, 'isbn') || googleData?.isbn || data.isbn;
            openLibraryData = await fetchOpenLibraryByISBN(isbnToUse);
          }

          if (!openLibraryData) {
            const titleToUse = data.title || googleData?.title || null;
            const authorToUse = Array.isArray(data.authors) ? data.authors[0] : (data.authors || data.author || null);
            openLibraryData = await fetchOpenLibraryByTitleAuthor(titleToUse, authorToUse);
          }

          fillMissingFields(data, updateObj, openLibraryData);
        }

        const mergedAuthors = mergeAuthors(data.authors || data.author, updateObj.authors, googleData?.authors, openLibraryData?.authors);
        if (mergedAuthors.length > 0) {
          updateObj.authors = mergedAuthors;
        }

        const nextSources = uniqueStrings([
          ...normalizedSources.urlSources,
          googleData?.sourceUrl,
          openLibraryData?.sourceUrl
        ].filter(Boolean));
        if (nextSources.length > 0) {
          updateObj.sources = nextSources;
        }
        if (normalizedSources.imageSources.length > 0) {
          updateObj.imageSources = normalizedSources.imageSources;
        }

        if (Object.keys(updateObj).length > 0) {
          await booksRef.doc(doc.id).update(updateObj);
          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        errors.push({ id: doc.id, error: String(e) });
      }
    }

    return res.status(200).json({ updated, skipped, errors });
  } catch (e) {
    console.error('enrich-existing-books error', e);
    return res.status(500).json({ message: 'Server error', error: String(e) });
  }
}
