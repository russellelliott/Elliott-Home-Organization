import { adminDb } from '../../lib/firebase-admin';

// Extract book id from known source URL patterns
function extractBookId(source) {
  if (!source) return null;

  // Google Books: id=8SFzDwAAQBAJ or /volumes/8SFzDwAAQBAJ
  const googleMatch = source.match(/(?:id=|volumes\/)([a-zA-Z0-9_-]+)/);
  if (googleMatch) return { source: 'Google Books', id: googleMatch[1] };

  // Open Library: capture type (works|books) and id (OL123W / OL123M)
  const olMatch = source.match(/openlibrary\.org\/(works|books)\/(OL\d+[WM])/);
  if (olMatch) return { source: 'Open Library', id: `${olMatch[1]}/${olMatch[2]}` };

  return null;
}

async function fetchByBookId(bookIdInfo) {
  const { source, id } = bookIdInfo;

  if (source === 'Google Books') {
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const imageLinks = data.volumeInfo?.imageLinks || {};
    const coverUrls = [];
    if (imageLinks.extraLarge) coverUrls.push(imageLinks.extraLarge);
    if (imageLinks.large) coverUrls.push(imageLinks.large);
    if (imageLinks.medium) coverUrls.push(imageLinks.medium);
    if (imageLinks.small) coverUrls.push(imageLinks.small);
    if (imageLinks.thumbnail) coverUrls.push(imageLinks.thumbnail);
    if (imageLinks.smallThumbnail) coverUrls.push(imageLinks.smallThumbnail);

    return {
      pageCount: data.volumeInfo?.pageCount || null,
      coverUrls: coverUrls.length ? coverUrls : null,
      source: 'Google Books'
    };
  }

  if (source === 'Open Library') {
    const candidate = id.endsWith('.json') ? id : `${id}.json`;
    const url = `https://openlibrary.org/${candidate}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
    });
    if (!res.ok) return null;
    const data = await res.json();

    const coverUrls = [];
    if (data.covers && data.covers.length > 0) {
      // data.covers is an array of cover ids
      const coverId = data.covers[0];
      coverUrls.push(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`);
      coverUrls.push(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
      coverUrls.push(`https://covers.openlibrary.org/b/id/${coverId}-S.jpg`);
    }

    return {
      pageCount: data.number_of_pages || null,
      coverUrls: coverUrls.length ? coverUrls : null,
      source: 'Open Library'
    };
  }

  return null;
}

// Fallback: fetch by ISBN via Google Books
async function fetchByISBN(isbn) {
  if (!isbn) return null;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) return null;
  const vol = item.volumeInfo || {};
  const imageLinks = vol.imageLinks || {};
  const coverUrls = [];
  if (imageLinks.extraLarge) coverUrls.push(imageLinks.extraLarge);
  if (imageLinks.large) coverUrls.push(imageLinks.large);
  if (imageLinks.medium) coverUrls.push(imageLinks.medium);
  if (imageLinks.small) coverUrls.push(imageLinks.small);
  if (imageLinks.thumbnail) coverUrls.push(imageLinks.thumbnail);
  if (imageLinks.smallThumbnail) coverUrls.push(imageLinks.smallThumbnail);

  return {
    pageCount: vol.pageCount || null,
    coverUrls: coverUrls.length ? coverUrls : null,
    source: 'Google Books'
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
        // If both coverImages and pageCount present, skip
        const hasCover = data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0;
        const hasPages = typeof data.pageCount === 'number' && data.pageCount > 0;
        if (hasCover && hasPages) {
          skipped++;
          continue;
        }

        const sourceStr = data.source || data.sourceUrl || data.sourceLink || null;
        let external = null;

        const idInfo = extractBookId(sourceStr);
        if (idInfo) {
          external = await fetchByBookId(idInfo);
        }

        // Fallback to ISBN
        if (!external && data.isbn) {
          external = await fetchByISBN(data.isbn);
        }

        if (!external) {
          skipped++;
          continue;
        }

        const updateObj = {};
        if (!hasPages && external.pageCount) updateObj.pageCount = external.pageCount;
        if (!hasCover && external.coverUrls) {
          updateObj.coverImages = external.coverUrls;
          updateObj.coverImage = external.coverUrls[0] || null;
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
