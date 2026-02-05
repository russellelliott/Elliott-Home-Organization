
import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  Container,
  Typography,
  Paper,
  Box,
  TextField,
  InputAdornment,
  TablePagination,
  Link
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

  if (!src) return null;

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
  // const [books, setBooks] = useState([]); // Now coming from props
  // const [loading, setLoading] = useState(true); // SSR is 'loading' until page arrives, so we can ignore or set false
  
  const columns = [
    { 
      field: 'cover', 
      headerName: 'Cover', 
      width: 70, 
      renderCell: (params) => {
        const imgUrl = (params.row.imagePaths && params.row.imagePaths.length > 0) 
          ? params.row.imagePaths[0] 
          : params.value;
          
        return <BookCover url={imgUrl} />;
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
        params.value ? (
          <Link href={params.value} target="_blank" rel="noopener noreferrer">
            {params.row.sourceLabel || "Link"}
          </Link>
        ) : null
      )
    },
    { field: 'description', headerName: 'Description', flex: 1.5, minWidth: 250 },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        My Library
      </Typography>
      
      <Paper sx={{ height: 700, width: '100%' }}>
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
        />
      </Paper>
    </Container>
  );
}

export async function getServerSideProps() {
  try {
    // 1. Fetch Locations Map
    const locationsRef = collection(db, 'locations');
    const locationsSnapshot = await getDocs(locationsRef);
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
    const booksRef = collection(db, 'books');
    const q = query(booksRef);
    const querySnapshot = await getDocs(q);

    const books = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Serialize helper for Firestore timestamps if any
      const serialize = (obj) => JSON.parse(JSON.stringify(obj));
      
      // Resolve Location
      const locName = data.locationId ? (locationsMap[data.locationId] || data.locationId) : '';

      // Resolve Source Label
      let sourceLabel = 'Link';
      if (data.source) {
        if (data.source.includes('books.google')) sourceLabel = 'Google Books';
        else if (data.source.includes('openlibrary.org')) sourceLabel = 'OpenLibrary';
      }

      return {
        id: doc.id,
        ...serialize(data),
        locationName: locName,
        sourceLabel: sourceLabel
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
