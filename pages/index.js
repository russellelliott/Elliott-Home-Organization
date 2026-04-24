
import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import {
  Box,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { DataGrid } from '@mui/x-data-grid';

const BOOKS_LIST_CACHE_KEY = 'books-list-cache-v1';

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

function colorFromValue(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 70%)`;
}

export default function BooksList({ books }) {
  const router = useRouter();
  const [loadedBooks, setLoadedBooks] = useState(() => books || []);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const rows = useMemo(() => loadedBooks, [loadedBooks]);

  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 7,
  });

  const handlePaginationModelChange = useCallback((nextModel) => {
    setPaginationModel((current) => {
      if (
        current.page === nextModel.page &&
        current.pageSize === nextModel.pageSize
      ) {
        return current;
      }
      return nextModel;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBooks = async () => {
      if (typeof window !== 'undefined') {
        const cached = window.sessionStorage.getItem(BOOKS_LIST_CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setLoadedBooks(parsed);
              setLoadingBooks(false);
              return;
            }
          } catch {
            window.sessionStorage.removeItem(BOOKS_LIST_CACHE_KEY);
          }
        }
      }

      setLoadingBooks(true);

      try {
        const response = await fetch('/api/books-list');
        if (!response.ok) {
          throw new Error(`Failed to load books: ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;

        const nextBooks = Array.isArray(data.books) ? data.books : [];
        setLoadedBooks(nextBooks);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(BOOKS_LIST_CACHE_KEY, JSON.stringify(nextBooks));
        }
      } catch (error) {
        console.error('Failed to load book list', error);
        if (isMounted) {
          setLoadedBooks([]);
        }
      } finally {
        if (isMounted) {
          setLoadingBooks(false);
        }
      }
    };

    loadBooks();

    return () => {
      isMounted = false;
    };
  }, []);

  const locationOptions = useMemo(() => {
    const counts = new Map();
    rows.forEach((book) => {
      const location = book.locationName?.trim() || 'No location';
      counts.set(location, (counts.get(location) || 0) + 1);
    });

    return [
      { value: 'all', label: 'All locations', count: rows.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, count]) => ({ value: label, label, count })),
    ];
  }, [rows]);

  const effectiveLocation =
    selectedLocation !== 'all' && locationOptions.some((option) => option.value === selectedLocation)
      ? selectedLocation
      : 'all';

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((book) => {
      const bookLocation = book.locationName?.trim() || 'No location';
      const matchesLocation = effectiveLocation === 'all' || bookLocation === effectiveLocation;

      if (!matchesLocation) return false;

      if (!query) return true;

      const haystack = [
        book.title,
        Array.isArray(book.authors) ? book.authors.join(' ') : '',
        book.publisher,
        book.publishedDate,
        book.isbn,
        book.locationName,
        book.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [rows, search, effectiveLocation]);

  const visibleRows = useMemo(() => {
    const start = paginationModel.page * paginationModel.pageSize;
    const end = start + paginationModel.pageSize;
    return filteredRows.slice(start, end);
  }, [filteredRows, paginationModel.page, paginationModel.pageSize]);

  const likelyRoutes = useMemo(() => visibleRows.map((book) => `/book/${book.id}`), [visibleRows]);
  const likelyImages = useMemo(
    () => visibleRows.map((book) => book.heroPreview || book.cover).filter(Boolean),
    [visibleRows]
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
  }, [likelyImages]);
  
  const columns = [
    {
      field: 'cover',
      headerName: 'Cover',
      width: 56,
      renderCell: (params) => {
        // `cover` contains the smallest available cover URL for the table
        return (
          <Box sx={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookCover url={params.value || ''} />
          </Box>
        );
      }
    },
    {
      field: 'book',
      headerName: 'Book',
      flex: 1,
      minWidth: 420,
      renderCell: (params) => (
        <Box sx={{ py: 0.1, display: 'flex', gap: 0.75, alignItems: 'flex-start', width: '100%' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={params.row.title || ''}
            >
              {params.row.title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                lineHeight: 1.25,
                fontSize: '0.79rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`${Array.isArray(params.row.authors) && params.row.authors.length > 0
                ? params.row.authors.join(', ')
                : 'Unknown author'}${params.row.publisher ? ` · ${params.row.publisher}` : ''}${params.row.publishedDate ? ` · ${params.row.publishedDate}` : ''}`}
            >
              {Array.isArray(params.row.authors) && params.row.authors.length > 0
                ? params.row.authors.join(', ')
                : 'Unknown author'}
              {params.row.publisher ? ` · ${params.row.publisher}` : ''}
              {params.row.publishedDate ? ` · ${params.row.publishedDate}` : ''}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                mt: 0,
                width: '100%',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
                color: 'text.secondary',
                fontSize: '0.79rem',
              }}
              title={params.row.description || ''}
            >
              {params.row.description || 'No description available.'}
            </Typography>
          </Box>

          <Stack
            spacing={0.1}
            alignItems="flex-end"
            sx={{ minWidth: 170, flexShrink: 0, pt: 0 }}
          >
            {params.row.locationName ? (
              <Chip
                label={params.row.locationName}
                size="small"
                sx={{
                  alignSelf: 'flex-end',
                  backgroundColor: colorFromValue(`location:${params.row.locationName}`),
                  color: 'rgba(17, 24, 39, 0.92)',
                  fontWeight: 700,
                  height: 24,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            ) : null}
            {params.row.isbn ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.15, textAlign: 'right' }}>
                {params.row.isbn}
              </Typography>
            ) : null}
          </Stack>
        </Box>
      )
    },
  ];

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 }, gap: 2 }}>
      <Head>
        <title>My Library</title>
        {likelyImages.map((src) => (
          <link key={src} rel="preload" as="image" href={src} />
        ))}
      </Head>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid rgba(17, 24, 39, 0.08)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,246,240,0.98) 100%)',
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 2.5 },
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', lg: 'center' }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              My Library
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Browse, filter, and search your shelf inventory.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
            <TextField
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPaginationModel((current) => ({ ...current, page: 0 }));
              }}
              placeholder="Search books..."
              size="small"
              sx={{ minWidth: { xs: '100%', md: 280 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Chip
              label={
                filteredRows.length === rows.length
                  ? `${rows.length} books`
                  : `${filteredRows.length} of ${rows.length} books`
              }
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
            />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
          {locationOptions.map((option) => (
            <Chip
              key={option.value}
              label={`${option.label}${option.count != null ? ` (${option.count})` : ''}`}
              onClick={() => {
                setSelectedLocation(option.value);
                setPaginationModel((current) => ({ ...current, page: 0 }));
              }}
              color={effectiveLocation === option.value ? 'primary' : 'default'}
              variant={effectiveLocation === option.value ? 'filled' : 'outlined'}
              sx={{ borderRadius: 999, px: 0.5 }}
            />
          ))}
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          overflow: 'visible',
          borderRadius: 4,
          border: '1px solid rgba(17, 24, 39, 0.08)',
          backgroundColor: '#fff',
        }}
      >
        {loadingBooks ? (
          <Box sx={{ p: 3, color: 'text.secondary' }}>Loading books...</Box>
        ) : null}
        <DataGrid
          rows={filteredRows}
          columns={columns}
          autoHeight
          disableVirtualization
          rowHeight={72}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[7, 10, 25, 50, 100]}
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
          localeText={{ noRowsLabel: 'No books match this filter.' }}
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
            fontSize: '0.85rem',
            '& .MuiDataGrid-columnHeaders': {
              fontSize: '0.78rem',
              backgroundColor: '#f7f4ec',
              borderBottom: '1px solid rgba(17, 24, 39, 0.06)'
            },
            '& .MuiDataGrid-cell': {
              fontSize: '0.85rem',
              py: 0.1,
              alignItems: 'flex-start',
            },
            '& .MuiDataGrid-virtualScroller': {
              overflowX: 'hidden !important'
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: 'rgba(31, 74, 143, 0.04)',
            },
          }}
        />
      </Paper>
    </Box>
  );
}
