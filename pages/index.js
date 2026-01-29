import { useState, useEffect } from 'react';
import Head from 'next/head';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Select,
  MenuItem,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  CircularProgress,
  FormControl,
  InputLabel,
  Stack,
  Alert
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import SearchIcon from '@mui/icons-material/Search';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState('Espana Ct Office');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [fetchingGoogle, setFetchingGoogle] = useState(false);
  const [enrichedData, setEnrichedData] = useState({});
  const [googleBooksData, setGoogleBooksData] = useState({});
  const [gpsData, setGpsData] = useState(null);
  const [extractingGps, setExtractingGps] = useState(false);

  // ...existing code...
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        });
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const folders = ["Espana Ct Office", "Santa Cruz Cottage"];

  const handleExtractGPS = async () => {
    setExtractingGps(true);
    setGpsData(null);
    try {
      const res = await fetch('/api/extract-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: selectedFolder }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setGpsData(data); // Show data immediately

         // Reverse geocode via REST API
        if (data.gpsData && data.gpsData.length > 0) {
            const updatedGpsList = [...data.gpsData];
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

            for (let i = 0; i < updatedGpsList.length; i++) {
                const item = updatedGpsList[i];
                try {
                  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${item.latitude},${item.longitude}&key=${apiKey}`);
                  const geoData = await geoRes.json();
                  
                  if (geoData.status === 'OK' && geoData.results[0]) {
                     updatedGpsList[i] = { ...item, address: geoData.results[0].formatted_address };
                  } else {
                     updatedGpsList[i] = { ...item, address: `Lookup failed: ${geoData.status}` };
                  }

                } catch (err) {
                    console.error('Error reverse geocoding:', item.fileName, err);
                    updatedGpsList[i] = { ...item, address: 'Lookup failed' };
                }
            }
            // Update state with addresses
            setGpsData(prev => ({ ...prev, gpsData: updatedGpsList }));
        }

      } else {
        alert(data.message || 'Failed to extract GPS data');
      }
    } catch (error) {
      console.error('Error extracting GPS:', error);
      alert('An error occurred during GPS extraction');
    } finally {
      setExtractingGps(false);
    }
  };

  const handleScan = async () => {
    setLoading(true);
    setBooks([]);
    setEnrichedData({});
    try {
      const res = await fetch('/api/scan-shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: selectedFolder }),
      });
      const data = await res.json();
      if (res.ok) {
        setBooks(data.books);
      } else {
        alert(data.message || 'Scan failed');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred during scanning');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setFetchingGoogle(true);
    
    // Process in batches
    for (const book of books) {
      if (!enrichedData[book.title]) {
        try {
          const res = await fetch('/api/enrich-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: book.title, author: book.author }),
          });
          const details = await res.json();
          setEnrichedData(prev => ({ ...prev, [book.title]: details }));
        } catch (e) {
          console.error("Failed to enrich", book.title);
          setEnrichedData(prev => ({ ...prev, [book.title]: { error: true } }));
        }
      }

      if (!googleBooksData[book.title]) {
        try {
            let res = await fetch('/api/google-books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: book.title, author: book.author }),
            });
            let details = await res.json();

            // Retry with just title if author search failed
            if (details.error && book.author) {
                console.log(`Retrying Google Books search for "${book.title}" without author`);
                res = await fetch('/api/google-books', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: book.title }), 
                });
                details = await res.json();
            }
            
            if (details.error) {
                console.log(`Book not found in Google Books: "${book.title}"`);
            }

            setGoogleBooksData(prev => ({ ...prev, [book.title]: details }));
        } catch (e) {
            console.error("Failed to fetch Google Books data", book.title);
            setGoogleBooksData(prev => ({ ...prev, [book.title]: { error: true } })); 
        }
      }
    }
    setEnriching(false);
    setFetchingGoogle(false);
  };

  if (authLoading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  );

  if (!user) {
    return (
      <Container maxWidth="sm">
        <Head>
          <title>Elliott Home Organization</title>
          <meta name="description" content="Sign in to access Elliott Home Organization" />
        </Head>
        <Box 
          display="flex" 
          flexDirection="column" 
          alignItems="center" 
          justifyContent="center" 
          minHeight="100vh" 
          gap={4}
        >
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Elliott Home Organization
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<GoogleIcon />} 
            onClick={handleLogin}
            size="large"
          >
            Sign in with Google
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <>
      <Head>
        <title>Elliott Home Organizer</title>
        <meta name="description" content="Scan bookshelves and get details" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Elliott Home Organizer
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            {user.photoURL && <Avatar src={user.photoURL} alt="Profile" />}
            <Button color="inherit" onClick={handleLogout}>Sign Out</Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Stack spacing={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Step 1: Select Location
              </Typography>
              <Box display="flex" gap={2} alignItems="center">
                <FormControl fullWidth size="small">
                  <InputLabel>Location</InputLabel>
                  <Select
                    value={selectedFolder}
                    label="Location"
                    onChange={(e) => setSelectedFolder(e.target.value)}
                  >
                    {folders.map(f => (
                      <MenuItem key={f} value={f}>{f}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button 
                  variant="contained" 
                  onClick={handleScan} 
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                  sx={{ minWidth: 200 }}
                >
                  {loading ? 'Scanning...' : 'Scan For Books'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ bgcolor: '#f9f9f9' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                GPS Location Extraction
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Extract GPS coordinates from all images in <strong>{selectedFolder}</strong>:
              </Typography>
              
              <Button
                variant="outlined"
                onClick={handleExtractGPS}
                disabled={extractingGps}
                startIcon={extractingGps ? <CircularProgress size={20} /> : <LocationOnIcon />}
                sx={{ mb: 2 }}
              >
                {extractingGps ? 'Extracting GPS data...' : 'Get GPS for Folder'}
              </Button>
              
              {gpsData && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Extracted GPS Data ({gpsData.gpsData.length} images with GPS)
                  </Typography>
                  <Typography variant="body2" paragraph>
                    Checked {gpsData.imageCount} images in {gpsData.folder}.
                  </Typography>
                  
                  {gpsData.gpsData.length > 0 ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>File</TableCell>
                            <TableCell>Latitude</TableCell>
                            <TableCell>Longitude</TableCell>
                            <TableCell>Address</TableCell>
                            <TableCell>Date</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {gpsData.gpsData.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{item.fileName}</TableCell>
                              <TableCell>{typeof item.latitude === 'number' ? item.latitude.toFixed(6) : item.latitude}</TableCell>
                              <TableCell>{typeof item.longitude === 'number' ? item.longitude.toFixed(6) : item.longitude}</TableCell>
                              <TableCell>{item.address || 'Loading...'}</TableCell>
                              <TableCell>{item.dateStamp} {item.timeStamp}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No GPS coordinates found in any images.</Alert>
                  )}
                </Paper>
              )}
            </CardContent>
          </Card>

          {books.length > 0 && (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box>
                    <Typography variant="h6">
                        Step 2: Review & Enrich
                    </Typography>
                    <Typography variant="subtitle2" color="text.secondary">
                        Found {books.length} books
                    </Typography>
                  </Box>
                  <Button 
                    variant="contained" 
                    color="secondary"
                    onClick={handleEnrich} 
                    disabled={enriching}
                    startIcon={enriching ? <CircularProgress size={20} color="inherit" /> : <AutoStoriesIcon />}
                  >
                    {enriching ? 'Fetching Details...' : 'Get Enriched Information'}
                  </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell>Detected Title</TableCell>
                        <TableCell>Detected Author</TableCell>
                        <TableCell>Image Source</TableCell>
                        <TableCell>Details (Perplexity)</TableCell>
                        <TableCell>Details (Google Books)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {books.map((book, idx) => (
                        <TableRow key={idx}>
                          <TableCell sx={{ verticalAlign: 'top' }}>{book.title}</TableCell>
                          <TableCell sx={{ verticalAlign: 'top' }}>{book.author}</TableCell>
                          <TableCell sx={{ verticalAlign: 'top' }}>
                            {book.sources ? (Array.isArray(book.sources) ? book.sources.join(', ') : book.sources) : '-'}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'top' }}>
                            {enrichedData[book.title] ? (
                              enrichedData[book.title].error ? (
                                <Alert severity="error" size="small">Error fetching details</Alert>
                              ) : (
                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                  <Box component="li"><strong>Authors:</strong> {Array.isArray(enrichedData[book.title].authors) ? enrichedData[book.title].authors.join(', ') : enrichedData[book.title].authors}</Box>
                                  <Box component="li"><strong>ISBN:</strong> {enrichedData[book.title].isbn}</Box>
                                  <Box component="li"><strong>Publisher:</strong> {enrichedData[book.title].publisher}</Box>
                                  <Box component="li"><strong>Year:</strong> {enrichedData[book.title].publicationDate}</Box>
                                  <Box component="li"><strong>Edition:</strong> {enrichedData[book.title].edition}</Box>
                                </Box>
                              )
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                {enriching ? 'Pending...' : '-'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'top' }}>
                             {googleBooksData[book.title] ? (
                                googleBooksData[book.title].error ? (
                                    <Alert severity="warning" size="small">Book not found in any database</Alert>
                                ) : (
                                    <Box display="flex" gap={2}>
                                        {googleBooksData[book.title].thumbnail && (
                                            <img src={googleBooksData[book.title].thumbnail} alt="Cover" style={{ width: '60px', height: 'auto', alignSelf: 'flex-start' }} />
                                        )}
                                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                            <Box component="li">
                                                <strong>Source:</strong> 
                                                <Typography 
                                                  component="a" 
                                                  href={googleBooksData[book.title].canonicalVolumeLink} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  variant="caption" 
                                                  sx={{ 
                                                    ml: 1, 
                                                    px: 1, 
                                                    py: 0.5, 
                                                    bgcolor: 'action.selected', 
                                                    borderRadius: 1,
                                                    textDecoration: 'none',
                                                    color: 'text.primary',
                                                    transition: 'background-color 0.2s',
                                                    '&:hover': {
                                                      bgcolor: 'action.focus', 
                                                      cursor: 'pointer'
                                                    }
                                                  }}
                                                >
                                                    {googleBooksData[book.title].source || 'Google Books'}
                                                </Typography>
                                            </Box>
                                            <Box component="li"><strong>Title:</strong> {googleBooksData[book.title].title}</Box>
                                            <Box component="li"><strong>Authors:</strong> {Array.isArray(googleBooksData[book.title].authors) ? googleBooksData[book.title].authors.join(', ') : googleBooksData[book.title].authors}</Box>
                                            <Box component="li"><strong>ISBN:</strong> {googleBooksData[book.title].isbn || 'N/A'}</Box>
                                            <Box component="li"><strong>Publisher:</strong> {googleBooksData[book.title].publisher}</Box>
                                            <Box component="li"><strong>Date:</strong> {googleBooksData[book.title].publishedDate}</Box>
                                            {googleBooksData[book.title].description && (
                                                <Box component="li">
                                                    <strong>Description:</strong>
                                                    <Typography variant="body2" sx={{ 
                                                        display: '-webkit-box', 
                                                        overflow: 'hidden', 
                                                        WebkitBoxOrient: 'vertical', 
                                                        WebkitLineClamp: 4,
                                                        maxHeight: '6em' 
                                                    }}>
                                                        {googleBooksData[book.title].description}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                )
                             ) : (
                                <Typography variant="body2" color="text.secondary">
                                    {fetchingGoogle ? 'Pending...' : '-'}
                                </Typography>
                             )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Container>
    </>
  );
}
