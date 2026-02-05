
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
    { field: 'imagePath', headerName: 'Cover', width: 70, renderCell: (params) => (
        params.value ? <img src={params.value} alt="cover" style={{ height: '100%', objectFit: 'contain' }} /> : null
    )},
    { field: 'title', headerName: 'Title', width: 300 },
    { field: 'authors', headerName: 'Author(s)', width: 200 },
    { field: 'publisher', headerName: 'Publisher', width: 200 },
    { field: 'year', headerName: 'Year', width: 100 },
    { field: 'location', headerName: 'Location', width: 200 },
    { field: 'fileHash', headerName: 'Hash (SHA256)', width: 150 },
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
