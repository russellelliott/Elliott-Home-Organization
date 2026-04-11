import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { adminDb } from '../../lib/firebase-admin';
import { Container, Box, Typography, Paper, Link } from '@mui/material';

const CoverImg = ({ src, candidates = [], title, authors, sx }) => {
  const normalizedCandidates = useMemo(() => {
    const base = [];
    if (src) base.push(src);
    if (Array.isArray(candidates)) base.push(...candidates);
    return [...new Set(base.filter(Boolean))];
  }, [src, candidates]);

  const candidateSignature = useMemo(
    () => normalizedCandidates.join('|'),
    [normalizedCandidates]
  );

  const [candidateIdx, setCandidateIdx] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
  }, [candidateSignature]);

  const currentSrc = normalizedCandidates[candidateIdx] || null;

  const useNextCandidate = () => {
    setCandidateIdx((prev) => (prev < normalizedCandidates.length - 1 ? prev + 1 : prev));
  };

  // Placeholder when no src: dark-blue rectangle with title centered and author at bottom
  if (!currentSrc) {
    return (
      <Box sx={{ width: '100%', height: '100%', bgcolor: '#0b3d91', color: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', position: 'relative', pt: 1, px: 1.5, pb: 2, ...sx }}>
        <Typography variant="subtitle2" sx={{ textAlign: 'center', fontWeight: 'bold', fontSize: { xs: '0.78rem', md: '0.88rem' }, lineHeight: 1.2 }}>{title || 'Untitled'}</Typography>
        {authors ? <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>{authors}</Typography> : null}
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={currentSrc}
      alt={title || 'cover'}
      onError={useNextCandidate}
      onLoad={(e) => {
        const img = e.currentTarget;
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        if (!w || !h) return;

        // Typical portrait book covers are roughly 0.5-0.8 width/height.
        // If not portrait-like, try a smaller candidate (often a better-cropped zoom).
        const ratio = w / h;
        const looksLikeBookCover = ratio >= 0.42 && ratio <= 0.9;
        if (!looksLikeBookCover) {
          useNextCandidate();
        }
      }}
      sx={{ width: '100%', height: '100%', objectFit: 'contain', ...sx }}
    />
  );
};

export default function BookPage({ book, locationName }) {
  const [idx, setIdx] = useState(0);
  const [heroSrc, setHeroSrc] = useState('');

  if (!book) {
    return (
      <Container>
        <Typography variant="h6">Book not found</Typography>
      </Container>
    );
  }

  const heroImages = (book.imagePaths && Array.isArray(book.imagePaths) && book.imagePaths.length > 0)
    ? book.imagePaths
    : [];

  // Build cover candidates largest->smallest: OpenLibrary L/M/S then Google high zoom to low.
  const getCoverCandidates = (urls) => {
    if (!urls || !Array.isArray(urls) || urls.length === 0) return [];

    const unique = [...new Set(urls.filter(Boolean))];

    // OpenLibrary L/M/S
    const olL = unique.find(u => u.includes('-L.jpg'));
    const olM = unique.find(u => u.includes('-M.jpg'));
    const olS = unique.find(u => u.includes('-S.jpg'));

    // Google Books: order by highest zoom first
    const zoomPairs = unique.map(u => {
      const m = u.match(/zoom=(\d+)/);
      return { url: u, zoom: m ? parseInt(m[1], 10) : null };
    }).filter(p => p.zoom !== null);
    zoomPairs.sort((a,b) => b.zoom - a.zoom);
    const googleOrdered = zoomPairs.map(p => p.url);

    const primaryOrdered = [olL, olM, olS, ...googleOrdered].filter(Boolean);
    const remaining = unique.filter(u => !primaryOrdered.includes(u));
    return [...primaryOrdered, ...remaining];
  };

  let coverCandidates = [];
  if (book.coverImages && Array.isArray(book.coverImages) && book.coverImages.length > 0) {
    coverCandidates = getCoverCandidates(book.coverImages);
  } else if (book.coverImage) {
    coverCandidates = [book.coverImage];
  } else if (book.cover) {
    coverCandidates = [book.cover];
  }

  const coverLarge = coverCandidates[0] || '';

  const currentHero = heroImages.length > 0 ? heroImages[idx] : coverLarge;

  useEffect(() => {
    setHeroSrc(currentHero || '');
  }, [currentHero]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Head>
        <title>{book.title || 'Book'}</title>
      </Head>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Hero Section */}
          <Box sx={{ position: 'relative', width: { xs: '100%', md: '52%' }, height: { xs: 320, md: 520 }, background: '#000' }}>
            {heroSrc && (
              <Box
                component="img"
                src={heroSrc}
                onError={() => {
                  if (currentHero && !heroSrc.startsWith('/api/image')) {
                    setHeroSrc(`/api/image?url=${encodeURIComponent(currentHero)}`);
                  }
                }}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}

            {/* Dots for multi-photo toggle */}
            {heroImages.length > 1 && (
              <Box sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1 }}>
                {heroImages.map((_, i) => (
                  <Box
                    key={i}
                    onClick={() => setIdx(i)}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: i === idx ? 'primary.main' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Overlay: primary book cover */}
            <Box
              sx={{
                position: 'absolute',
                left: { xs: 16, md: 40 },
                top: '50%',
                transform: 'translateY(-50%)',
                width: { xs: 120, md: 180 },
                boxShadow: 3
              }}
            >
              <CoverImg src={coverLarge} candidates={coverCandidates} title={book.title} authors={book.authors} sx={{ height: { xs: 160, md: 240 } }} />
            </Box>
          </Box>

          {/* Metadata and description beside hero */}
          <Box sx={{ width: { xs: '100%', md: '48%' }, p: { xs: 3, md: 4 } }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{book.title}</Typography>
            <Typography variant="subtitle1" sx={{ color: 'text.secondary', mb: 2 }}>{book.authors}</Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                columnGap: 2,
                rowGap: 1,
                alignItems: 'start',
                mb: 3
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>ISBN</Typography>
              <Typography>{book.isbn || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Location</Typography>
              <Typography>{locationName || book.locationId || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Page Count</Typography>
              <Typography>{book.pageCount || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Published</Typography>
              <Typography>{book.publishedDate || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Publisher</Typography>
              <Typography>{book.publisher || '—'}</Typography>
            </Box>

            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 2.5 }}>{book.description || 'No description available.'}</Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Sources:</Typography>
              {Array.isArray(book.sources) && book.sources.length > 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {book.sources.map((src, idx) => (
                    <Link key={`${src}-${idx}`} href={src} target="_blank" rel="noopener noreferrer">[{idx + 1}]</Link>
                  ))}
                </Box>
              ) : (
                <Typography>—</Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}

export async function getServerSideProps(context) {
  const { slug } = context.params;
  try {
    const docRef = adminDb.collection('books').doc(slug);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { props: { book: null } };
    }

    const data = doc.data() || {};

    // Resolve location name if possible
    let locationName = null;
    if (data.locationId) {
      const locDoc = await adminDb.collection('locations').doc(data.locationId).get();
      if (locDoc.exists) {
        const ld = locDoc.data() || {};
        locationName = ld.name || ld.title || null;
      }
    }

    // Ensure arrays and strings are serializable
    const urlSources = Array.isArray(data.sources)
      ? data.sources.filter(v => typeof v === 'string' && /^https?:\/\//i.test(v))
      : [];

    const normalizedSources = urlSources.length > 0
      ? urlSources
      : [data.sourceUrl, data.source].filter(v => typeof v === 'string' && /^https?:\/\//i.test(v));

    const book = {
      id: doc.id,
      title: data.title || '',
      authors: Array.isArray(data.authors) ? data.authors.join(', ') : (data.authors || data.author || ''),
      publisher: data.publisher || '',
      publishedDate: data.publishedDate || data.publicationDate || '',
      isbn: data.isbn || '',
      pageCount: data.pageCount || null,
      description: data.description || '',
      coverImages: Array.isArray(data.coverImages) ? data.coverImages : (data.coverImage ? [data.coverImage] : []),
      coverImage: data.coverImage || data.cover || null,
      imagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
      sources: normalizedSources,
      locationId: data.locationId || ''
    };

    return {
      props: {
        book,
        locationName
      }
    };
  } catch (e) {
    console.error('Book page SSR error', e);
    return { props: { book: null } };
  }
}
