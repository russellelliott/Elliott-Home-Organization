import { useState } from 'react';
import Head from 'next/head';
import { adminDb } from '../../lib/firebase-admin';
import { Container, Box, Typography, Paper, Link } from '@mui/material';

const CoverImg = ({ src, title, authors, sx }) => {
  // Placeholder when no src: dark-blue rectangle with title centered and author at bottom
  if (!src) {
    return (
      <Box sx={{ width: '100%', height: '100%', bgcolor: '#0b3d91', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', p: 2, ...sx }}>
        <Typography variant="subtitle1" sx={{ textAlign: 'center', fontWeight: 'bold' }}>{title || 'Untitled'}</Typography>
        {authors ? <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>{authors}</Typography> : null}
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={title || 'cover'}
      sx={{ width: '100%', height: '100%', objectFit: 'contain', ...sx }}
    />
  );
};

export default function BookPage({ book, locationName }) {
  const [idx, setIdx] = useState(0);

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

  // Choose largest cover available: prefer OpenLibrary L, then M, then S.
  // For Google Books, prefer highest zoom parameter (e.g., zoom=6,5...)
  const chooseLargestCover = (urls) => {
    if (!urls || !Array.isArray(urls) || urls.length === 0) return null;

    // OpenLibrary L/M/S
    const olL = urls.find(u => u.includes('-L.jpg'));
    if (olL) return olL;
    const olM = urls.find(u => u.includes('-M.jpg'));
    if (olM) return olM;

    // Google Books: pick highest zoom value
    const zoomPairs = urls.map(u => {
      const m = u.match(/zoom=(\d+)/);
      return { url: u, zoom: m ? parseInt(m[1], 10) : null };
    }).filter(p => p.zoom !== null);
    if (zoomPairs.length > 0) {
      zoomPairs.sort((a,b) => b.zoom - a.zoom);
      return zoomPairs[0].url;
    }

    // Fallback: first item (often largest in typical arrays)
    return urls[0] || null;
  };

  let coverLarge = '';
  if (book.coverImages && Array.isArray(book.coverImages) && book.coverImages.length > 0) {
    coverLarge = chooseLargestCover(book.coverImages) || '';
  } else if (book.coverImage) {
    coverLarge = book.coverImage;
  } else if (book.cover) {
    coverLarge = book.cover;
  }

  const currentHero = heroImages.length > 0 ? heroImages[idx] : coverLarge;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Head>
        <title>{book.title || 'Book'}</title>
      </Head>

      <Paper sx={{ overflow: 'hidden' }}>
        {/* Hero Section */}
        <Box sx={{ position: 'relative', height: { xs: 320, md: 420 }, background: '#000' }}>
          {currentHero && (
            <Box component="img" src={currentHero} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          {(
            <Box sx={{ position: 'absolute', left: { xs: 16, md: 40 }, bottom: -64, width: { xs: 120, md: 180 }, boxShadow: 3 }}>
              <CoverImg src={coverLarge} title={book.title} authors={book.authors} sx={{ height: { xs: 160, md: 240 } }} />
            </Box>
          )}
        </Box>

        {/* Information Grid: left column fixed width, right column flexible */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, p: 4 }}>
          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>ISBN</Typography>
              <Typography>{book.isbn || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>Location</Typography>
              <Typography>{locationName || book.locationId || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>Page Count</Typography>
              <Typography>{book.pageCount || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>Published</Typography>
              <Typography>{book.publishedDate || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>Publisher</Typography>
              <Typography>{book.publisher || '—'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2 }}>Source</Typography>
              {book.sourceUrl ? (
                <Link href={book.sourceUrl} target="_blank" rel="noopener noreferrer">{book.sourceUrl}</Link>
              ) : (
                <Typography>—</Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{book.title}</Typography>
            <Typography variant="subtitle1" sx={{ color: 'text.secondary', mb: 2 }}>{book.authors}</Typography>

            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{book.description || 'No description available.'}</Typography>
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
    const book = {
      id: doc.id,
      title: data.title || '',
      authors: Array.isArray(data.authors) ? data.authors.join(', ') : (data.authors || data.author || ''),
      publisher: data.publisher || '',
      publishedDate: data.publishedDate || '',
      isbn: data.isbn || '',
      pageCount: data.pageCount || null,
      description: data.description || '',
      coverImages: Array.isArray(data.coverImages) ? data.coverImages : (data.coverImage ? [data.coverImage] : []),
      coverImage: data.coverImage || data.cover || null,
      imagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
      sourceUrl: data.sourceUrl || data.source || '',
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
