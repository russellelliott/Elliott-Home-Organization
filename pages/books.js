
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
  TablePagination
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

export default function BooksList() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  
  // Search state is handled by DataGrid's Quick Filter usually, 
  // but we can add specific filters if needed.
  // For standard MUI DataGrid, the GridToolbar includes a quick filter.

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksRef = collection(db, 'books');
        // const q = query(booksRef, orderBy('createdAt', 'desc')); // Assuming createdAt or similar
        const q = query(booksRef);
        const querySnapshot = await getDocs(q);
        
        const booksData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setBooks(booksData);
      } catch (error) {
        console.error("Error fetching books:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

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
    { field: 'locationId', headerName: 'Location', width: 100 },
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
          loading={loading}
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
