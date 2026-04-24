
import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import {
  Container,
  Typography,
  Paper,
  Box,
  Link,
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { getAllBooksForList } from '../lib/books';
import { useBooks } from '../context/BooksContext';

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
        <Box sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, textAlign: 'center' }}>?</Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Image
        src={src}
        alt="cover"
        fill
        sizes="56px"
        style={{ objectFit: 'contain' }}
        onError={handleError}
      />
    </Box>
  );
};

export default function BooksList({ books }) {
  const router = useRouter();
  const booksContext = useBooks();
  const rows = useMemo(() => {
    if (books.length > 0) return books;
    return booksContext?.books || [];
  }, [books, booksContext?.books]);

  const [paginationModel, setPaginationModel] = useState(() => ({
    page: booksContext?.tableState?.page ?? 0,
    pageSize: booksContext?.tableState?.pageSize ?? 7,
  }));

  useEffect(() => {
    booksContext?.upsertBooks(rows);
  }, [rows, booksContext]);

  useEffect(() => {
    booksContext?.setTableState(paginationModel);
  }, [paginationModel, booksContext]);

  const visibleBooks = useMemo(() => {
    const start = paginationModel.page * paginationModel.pageSize;
    const end = start + paginationModel.pageSize;
    return rows.slice(start, end);
  }, [rows, paginationModel.page, paginationModel.pageSize]);

  const likelyRoutes = useMemo(() => visibleBooks.map((book) => `/book/${book.id}`), [visibleBooks]);
  const likelyImages = useMemo(
    () => visibleBooks.map((book) => book.heroPreview || book.cover).filter(Boolean),
    [visibleBooks]
  );

  useEffect(() => {
    likelyRoutes.forEach((route) => {
      router.prefetch(route);
    });
  }, [router, likelyRoutes]);

  useEffect(() => {
    likelyImages.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
    booksContext?.cacheImages(likelyImages);
  }, [likelyImages, booksContext]);
  
  const columns = [
    {
      field: 'cover',
      headerName: 'Cover',
      width: 56,
      renderCell: (params) => {
        // `cover` contains the smallest available cover URL for the table
        return <BookCover url={params.value || ''} />;
      }
    },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1.1,
      minWidth: 150,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'authors',
      headerName: 'Author(s)',
      flex: 0.9,
      minWidth: 130,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {Array.isArray(params.value) ? params.value.join(', ') : ''}
        </Box>
      )
    },
    {
      field: 'publisher',
      headerName: 'Publisher',
      flex: 1,
      minWidth: 180,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'publishedDate',
      headerName: 'Published',
      width: 96,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'isbn',
      headerName: 'ISBN',
      width: 152,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'locationName',
      headerName: 'Location',
      width: 175,
      cellClassName: 'wrap-cell',
      renderCell: (params) => (
        <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, py: 0.5 }}>
          {params.value}
        </Box>
      )
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2.1,
      minWidth: 260,
      renderCell: (params) => (
        <Box
          title={params.value || ''}
          sx={{
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            py: 0.5
          }}
        >
          {params.value}
        </Box>
      )
    },
    { 
      field: 'sources', 
      headerName: 'Sources', 
      width: 96,
      renderCell: (params) => (
        Array.isArray(params.row.sources) && params.row.sources.length > 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
            {params.row.sources.map((src, idx) => (
              <Link key={`${src}-${idx}`} href={src} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>
                [{idx + 1}]
              </Link>
            ))}
          </Box>
        ) : null
      )
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', py: 2 }}>
      <Head>
        <title>My Library</title>
        {likelyImages.map((src) => (
          <link key={src} rel="preload" as="image" href={src} />
        ))}
      </Head>

      <Typography variant="h4" gutterBottom>
        My Library
      </Typography>
      
      <Paper sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          rowHeight={80}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[7, 10, 25, 50, 100]}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
            },
          }}
          disableRowSelectionOnClick
          onRowClick={(params) => {
            // Use hard navigation to avoid stale client-route state where URL changes but view does not.
            if (typeof window !== 'undefined') {
              window.location.assign(`/book/${params.id}`);
              return;
            }
            router.push(`/book/${params.id}`);
          }}
          onCellMouseEnter={(params) => {
            router.prefetch(`/book/${params.id}`);
          }}
          sx={{
            border: 0,
            width: '100%',
            fontSize: '0.82rem',
            '& .MuiDataGrid-columnHeaders': {
              fontSize: '0.78rem'
            },
            '& .MuiDataGrid-cell': {
              fontSize: '0.82rem'
            },
            '& .wrap-cell': {
              alignItems: 'flex-start'
            },
            '& .MuiDataGrid-virtualScroller': {
              overflowX: 'hidden !important'
            }
          }}
        />
      </Paper>
    </Container>
  );
}

export async function getStaticProps() {
  try {
    const books = await getAllBooksForList();

    return {
      props: { books },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static fetch error:', error);
    return {
      props: { books: [] },
      revalidate: 30,
    };
  }
}
