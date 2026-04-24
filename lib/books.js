import { adminDb } from './firebase-admin';

function chooseSmallestCover(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) return '';

  const olS = urls.find((u) => u.includes('-S.jpg'));
  if (olS) return olS;

  const zoomPairs = urls
    .map((u) => {
      const m = u.match(/zoom=(\d+)/);
      return { url: u, zoom: m ? parseInt(m[1], 10) : null };
    })
    .filter((p) => p.zoom !== null);

  if (zoomPairs.length > 0) {
    zoomPairs.sort((a, b) => a.zoom - b.zoom);
    return zoomPairs[0].url;
  }

  return urls[urls.length - 1] || '';
}

function orderCoverCandidates(urls = []) {
  const unique = [...new Set(urls.filter(Boolean))];

  const olL = unique.find((u) => u.includes('-L.jpg'));
  const olM = unique.find((u) => u.includes('-M.jpg'));
  const olS = unique.find((u) => u.includes('-S.jpg'));

  const zoomPairs = unique
    .map((u) => {
      const m = u.match(/zoom=(\d+)/);
      return { url: u, zoom: m ? parseInt(m[1], 10) : null };
    })
    .filter((p) => p.zoom !== null)
    .sort((a, b) => b.zoom - a.zoom);

  const ordered = [olL, olM, olS, ...zoomPairs.map((p) => p.url)].filter(Boolean);
  const remaining = unique.filter((u) => !ordered.includes(u));

  return [...ordered, ...remaining];
}

export async function getLocationsMap() {
  const snapshot = await adminDb.collection('locations').get();
  const map = {};
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    map[doc.id] = data.name || data.title || doc.id;
  });
  return map;
}

export async function getAllBooksForList() {
  const [locationsMap, booksSnapshot] = await Promise.all([
    getLocationsMap(),
    adminDb.collection('books').get(),
  ]);

  return booksSnapshot.docs.map((doc) => {
    const data = doc.data() || {};

    const coverSmall =
      Array.isArray(data.coverImages) && data.coverImages.length > 0
        ? chooseSmallestCover(data.coverImages)
        : data.coverImage || data.cover || '';

    const sources = Array.isArray(data.sources)
      ? data.sources.filter((v) => typeof v === 'string' && /^https?:\/\//i.test(v))
      : [];

    return {
      id: doc.id,
      title: data.title || 'Untitled',
      authors: Array.isArray(data.authors) ? data.authors : [],
      publisher: data.publisher || '',
      publishedDate: data.publishedDate || '',
      isbn: data.isbn || '',
      locationId: data.locationId || '',
      locationName: data.locationId ? locationsMap[data.locationId] || data.locationId : '',
      description: data.description ? data.description.substring(0, 300) : '',
      cover: coverSmall,
      heroPreview: Array.isArray(data.imagePaths) ? data.imagePaths[0] || '' : '',
      sources,
    };
  });
}

export async function getAllBookSlugs() {
  const snapshot = await adminDb.collection('books').get();
  return snapshot.docs.map((doc) => doc.id);
}

export async function getBookBySlug(slug) {
  const doc = await adminDb.collection('books').doc(slug).get();
  if (!doc.exists) return null;

  const data = doc.data() || {};

  let locationName = null;
  if (data.locationId) {
    const locDoc = await adminDb.collection('locations').doc(data.locationId).get();
    if (locDoc.exists) {
      const ld = locDoc.data() || {};
      locationName = ld.name || ld.title || null;
    }
  }

  const coverCandidates =
    Array.isArray(data.coverImages) && data.coverImages.length > 0
      ? orderCoverCandidates(data.coverImages)
      : [data.coverImage || data.cover].filter(Boolean);

  return {
    id: doc.id,
    title: data.title || '',
    authors: Array.isArray(data.authors) ? data.authors : [],
    publisher: data.publisher || '',
    publishedDate: data.publishedDate || '',
    isbn: data.isbn || '',
    pageCount: data.pageCount || null,
    description: data.description || '',
    coverImages: coverCandidates,
    coverImage: coverCandidates[0] || '',
    imagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
    sources: Array.isArray(data.sources)
      ? data.sources.filter((v) => typeof v === 'string' && /^https?:\/\//i.test(v))
      : [],
    locationId: data.locationId || '',
    locationName,
  };
}
