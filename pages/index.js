
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { adminDb } from '../lib/firebase-admin';
import { useRouter } from 'next/router';
import {
  Container,
  Typography,
  Paper,
  Box,
  TextField,
  InputAdornment,
  TablePagination,
  Link,
  Button,
  Dialog,
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';

const BookCover = ({ url }) => {
  const [src, setSrc] = useState(url);

  useEffect(() => {
    setSrc(url);
  }, [url]);

  const handleError = () => {
    // If the image fails to load (e.g. HEIC), try the proxy that converts it
    if (src && !src.startsWith('/api/image')) {
      setSrc(`/api/image?url=${encodeURIComponent(url)}`);
    }
  };

  if (!src) {
    // Placeholder small cover when no src available
    return (
      <Box sx={{ width: '100%', height: '100%', bgcolor: '#0b3d91', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', px: 1 }}>
        <Box sx={{ fontSize: 11, textAlign: 'center' }}>No cover</Box>
      </Box>
    );
  }

  return (
    <Box 
      component="img" 
      src={src} 
      alt="cover" 
      onError={handleError}
      sx={{ height: '100%', width: '100%', objectFit: 'contain' }} 
    />
  );
};

export default function BooksList({ books }) {
  const [viewShelfOpen, setViewShelfOpen] = useState(false);
  const [shelfImageInfo, setShelfImageInfo] = useState(null);
  const router = useRouter();

  const handleViewShelf = (row) => {
      // Use locationId as the folder name, assuming it maps to directory structure
      setShelfImageInfo({ folder: row.locationId, file: row.sourceFile });
      setViewShelfOpen(true);
  };
  
  const columns = [
    {
      field: 'cover',
      headerName: 'Cover',
      width: 70,
      renderCell: (params) => {
        // `cover` contains the smallest available cover URL for the table
        return <BookCover url={params.value || ''} />;
      }
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    { field: 'authors', headerName: 'Author(s)', flex: 0.8, minWidth: 150 },
    { field: 'publisher', headerName: 'Publisher', flex: 0.6, minWidth: 120 },
    { field: 'publishedDate', headerName: 'Published', width: 100 },
    { field: 'isbn', headerName: 'ISBN', width: 130 },
    { field: 'locationName', headerName: 'Location', width: 150 }, 
    { 
      field: 'source', 
      headerName: 'Source', 
      width: 130,
      renderCell: (params) => (
        params.row.sourceUrl ? (
          <Link href={params.row.sourceUrl} target="_blank" rel="noopener noreferrer">
            {params.row.sourceLabel || "Link"}
          </Link>
        ) : null
      )
    },
    {
         field: 'actions', headerName: 'Shelf View', width: 110,
         renderCell: (params) => (
             params.row.sourceFile ? 
             <Button size="small" variant="text" onClick={() => handleViewShelf(params.row)}>View Shelf</Button>
             : null
         )
    },
    { field: 'description', headerName: 'Description', flex: 1.5, minWidth: 250 },
  ];

  return (
    <Container maxWidth="xl" sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', py: 2 }}>
      <Head>
        <title>My Library</title>
      </Head>

      <Typography variant="h4" gutterBottom>
        My Library
      </Typography>
      
      <Paper sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
        <DataGrid
          rows={books}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10, page: 0 },
            },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
            },
          }}
          disableRowSelectionOnClick
          onRowClick={(params) => {
            // Navigate to individual book page using the document id as slug
            router.push(`/book/${params.id}`);
          }}
          sx={{ border: 0 }}
        />
      </Paper>

      <Dialog open={viewShelfOpen} onClose={() => setViewShelfOpen(false)} maxWidth="lg">
         {shelfImageInfo && (
             <Box component="img" 
                  src={`/api/local-shelf-image?folder=${encodeURIComponent(shelfImageInfo.folder)}&file=${encodeURIComponent(shelfImageInfo.file)}`}
                  sx={{ width: '100%', height: 'auto', maxHeight: '90vh', objectFit: 'contain' }} 
             />
         )}
      </Dialog>
    </Container>
  );
}

export async function getServerSideProps() {
  try {
    // 1. Fetch Locations Map
    const locationsRef = adminDb.collection('locations');
    const locationsSnapshot = await locationsRef.get();
    const locationsMap = {};
    locationsSnapshot.forEach(doc => {
      // Assuming location document has a 'name' field, or use ID as fallback
      const data = doc.data();
      // Try to find a sensible name field. If the user hasn't specified schema, we might need to guess 
      // or just check common fields. But user said "accessing the locations collection" implies they exist.
      // We'll assume 'name' exists based on typical schemas.
      locationsMap[doc.id] = data.name || data.title || doc.id;
    });

    // 2. Fetch Books
    const booksRef = adminDb.collection('books');
    const querySnapshot = await booksRef.get();

    const books = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Serialize helper for Firestore timestamps if any
      const serialize = (obj) => JSON.parse(JSON.stringify(obj));
      
      // Resolve Location
      const locName = data.locationId ? (locationsMap[data.locationId] || data.locationId) : '';

      // Resolve Source Label
      let sourceLabel = 'Link';
      if (data.source) {
        if (data.source.includes('google')) sourceLabel = 'Google Books';
        else if (data.source.includes('openlibrary')) sourceLabel = 'OpenLibrary';
      }

      // Handle Authors string vs array
      const rawAuthors = data.authors || data.author;
      const authorsList = Array.isArray(rawAuthors) ? rawAuthors : (rawAuthors ? [rawAuthors] : []);

      // Determine cover images for main table: choose the SMALLEST available cover from coverImages
      // (enrich flow stores largest first, smaller versions later; OpenLibrary pushes L,M,S)
      // Helper: choose the smallest cover from a list of URLs
      const chooseSmallestCover = (urls) => {
        if (!urls || !Array.isArray(urls) || urls.length === 0) return null;

        // Prefer OpenLibrary S.jpg
        const olS = urls.find(u => u.includes('-S.jpg'));
        if (olS) return olS;

        // Prefer the smallest zoom for Google Books (zoom=1 etc.)
        const zoomPairs = urls.map(u => {
          const m = u.match(/zoom=(\d+)/);
          return { url: u, zoom: m ? parseInt(m[1], 10) : null };
        }).filter(p => p.zoom !== null);
        if (zoomPairs.length > 0) {
          zoomPairs.sort((a,b) => a.zoom - b.zoom);
          return zoomPairs[0].url;
        }

        // Fallback: return last item (often smallest when stored L,M,S)
        return urls[urls.length - 1] || null;
      };

      let coverSmall = '';
      if (data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0) {
        coverSmall = chooseSmallestCover(data.coverImages) || '';
      } else if (data.coverImage) {
        coverSmall = data.coverImage;
      } else if (data.cover) {
        coverSmall = data.cover;
      } else {
        coverSmall = '';
      }

      // Projection for Slimming Payload
      return {
        id: doc.id,
        title: data.title || 'Untitled',
        authors: authorsList.join(', '), // Flatten for DataGrid
        publisher: data.publisher || '',
        publishedDate: data.publishedDate || '',
        isbn: data.isbn || '',
        locationName: locName,
        locationId: data.locationId || '', // Pass through for shelf view
        sourceLabel: sourceLabel,
        description: data.description ? data.description.substring(0, 500) : '',
        cover: coverSmall,
        sourceUrl: data.sourceUrl || data.source || '',
        sourceFile: (data.sources && Array.isArray(data.sources)) ? data.sources[0] : null // First source file
      };
    });

    return {
      props: {
        books,
      },
    };
  } catch (error) {
    console.error("Server-side fetch error:", error);
    return {
      props: {
        books: [],
      },
    };
  }
}
