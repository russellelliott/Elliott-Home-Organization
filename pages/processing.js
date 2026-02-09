import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import {
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
  CircularProgress,
  FormControl,
  InputLabel,
  Stack,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Grid,
  Typography
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import SearchIcon from '@mui/icons-material/Search';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import EditIcon from '@mui/icons-material/Edit';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

export default function ProcessingPage() {
  const { user, loading: authLoading } = useAuth();
  const [selectedFolder, setSelectedFolder] = useState('Espana Ct Office');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState('initial'); // 'initial' | 'analysis' | 'enrichment' | 'complete'
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false);


  // Edit / Redo State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBookIndex, setEditingBookIndex] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [feedbackType, setFeedbackType] = useState('both_wrong');
  const [feedbackDetails, setFeedbackDetails] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);

  // Manual Edit State
  const [manualEditDialogOpen, setManualEditDialogOpen] = useState(false);
  const [manualEditingBook, setManualEditingBook] = useState(null);
  const [manualEditingIndex, setManualEditingIndex] = useState(null);
  
  const [locations, setLocations] = useState([]);
  const [scanState, setScanState] = useState({ status: 'unknown', unprocessedCount: 0, unprocessedFiles: [] });

  useEffect(() => {
    const fetchLocations = async () => {
        try {
            const snap = await getDocs(collection(db, 'locations'));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setLocations(data);
            if (data.length > 0 && !selectedFolder) {
                setSelectedFolder(data[0].id);
            }
        } catch (e) {
            console.error("Failed to fetch locations", e);
        }
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    const checkUnprocessed = async () => {
       if (!selectedFolder || locations.length === 0) return;
       
       const loc = locations.find(l => l.id === selectedFolder);
       if (!loc) return;
       
       const allPhotos = loc.photoIds || [];
       if (allPhotos.length === 0) {
           // If no photos lists, maybe they aren't indexed yet, assume pending? 
           // Or strictly follow rule: Delta = 0 if empty.
           setScanState({ status: 'complete', unprocessedCount: 0, unprocessedFiles: [] });
           return;
       }

       const q = query(collection(db, 'books'), where('locationId', '==', selectedFolder));
       const snapshot = await getDocs(q);
       const locBooks = snapshot.docs.map(d => d.data());
       
       const processedPhotos = new Set();
       locBooks.forEach(b => {
           if (b.sources && Array.isArray(b.sources)) {
               b.sources.forEach(s => processedPhotos.add(s));
           }
       });

       const unprocessed = allPhotos.filter(p => !processedPhotos.has(p));
       
       setScanState({
           status: unprocessed.length === 0 ? 'complete' : 'pending',
           unprocessedCount: unprocessed.length,
           unprocessedFiles: unprocessed
       });
    };
    checkUnprocessed();
  }, [selectedFolder, locations]);


  const handleScan = async () => {
    if (scanState.status === 'complete') return;

    setLoading(true);
    setBooks([]);
    setPipelineStatus('initial');
    try {
      const res = await fetch('/api/scan-shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            folder: selectedFolder,
            targetFiles: scanState.unprocessedFiles 
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBooks(data.books);
        setPipelineStatus('analysis');
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

  const handleStartEnrichment = () => {
    setShowEnrichConfirm(true);
  };

  const handleConfirmEnrichment = async () => {
    setShowEnrichConfirm(false);
    setPipelineStatus('enrichment');
    setEnrichmentProgress({ current: 0, total: books.length });

    const newBooks = [...books];
    for (let i = 0; i < newBooks.length; i++) {
        const book = newBooks[i];
        try {
          const res = await fetch('/api/unified-enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...book }), // Ensure book object is passed correctly
          });
          const enrichedBook = await res.json();
          newBooks[i] = enrichedBook;
          setBooks([...newBooks]); 
          setEnrichmentProgress({ current: i + 1, total: books.length });
        } catch (err) {
            console.error(err);
        }
    }
    setBooks(newBooks);
    setPipelineStatus('complete');
  };

  const handleSyncToFirebase = async () => {
      if (!confirm('Are you sure you want to upload these books to Firebase? This may take a while.')) return;
      
      setPipelineStatus('syncing');
      try {
          const res = await fetch('/api/sync-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ books, folder: selectedFolder }),
          });
          
          const data = await res.json();
          if (res.ok) {
              alert(`Sync Complete! Synced: ${data.results.synced}, Failed: ${data.results.failed}`);
              window.location.href = '/books';
          } else {
              alert('Sync failed: ' + data.message);
          }
      } catch (err) {
          console.error(err);
          alert('Error during sync');
      } finally {
          setPipelineStatus('complete');
      }
  };

  const handleOpenEdit = (book, index) => {
    setEditingBook(book);
    setEditingBookIndex(index);
    setFeedbackType('both_wrong');
    setFeedbackDetails('');
    setEditDialogOpen(true);
  };

  const handleCloseEdit = () => {
    setEditDialogOpen(false);
    setEditingBook(null);
    setEditingBookIndex(null);
  };

  const handleReanalyze = async () => {
    if (!editingBook) return;
    setReanalyzing(true);
    try {
        const res = await fetch('/api/reanalyze-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: selectedFolder,
                sources: editingBook.sources,
                currentTitle: editingBook.title,
                currentAuthor: editingBook.author,
                feedbackType,
                feedbackDetails
            }),
        });
        const data = await res.json();
        if (res.ok) {
            // Update the book in the list
            const updatedBooks = [...books];
            updatedBooks[editingBookIndex] = {
                ...editingBook,
                title: data.correctedBook.title,
                author: data.correctedBook.author
            };
            setBooks(updatedBooks);
            
            handleCloseEdit();
        } else {
            alert(data.message || 'Re-analysis failed');
        }
    } catch (e) {
        console.error("Re-analysis error", e);
        alert('An error occurred');
    } finally {
        setReanalyzing(false);
    }
  };

  const handleOpenManualEdit = (book, index) => {
    setManualEditingBook({ ...book });
    setManualEditingIndex(index);
    setManualEditDialogOpen(true);
  };

  const handleCloseManualEdit = () => {
    setManualEditDialogOpen(false);
    setManualEditingBook(null);
    setManualEditingIndex(null);
  };

  const handleManualSave = () => {
    const updatedBooks = [...books];
    updatedBooks[manualEditingIndex] = manualEditingBook;
    setBooks(updatedBooks);
    setManualEditDialogOpen(false);
    setManualEditingBook(null);
    setManualEditingIndex(null);
  };

  if (authLoading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  );

  return (
    <>
      <Head>
        <title>Elliott Home Organizer</title>
        <meta name="description" content="Scan bookshelves and get details" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Stack spacing={4}>
          {/* Show location/scan UI only in initial pipeline state */}
          {pipelineStatus === 'initial' && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Select Location
                </Typography>
                <Box display="flex" gap={2} alignItems="center">
                  <FormControl fullWidth size="small">
                    <InputLabel>Location</InputLabel>
                    <Select
                      value={selectedFolder}
                      label="Location"
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      disabled={loading}
                    >
                       {locations.map(loc => (
                        <MenuItem key={loc.id} value={loc.id}>{loc.name || loc.id}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button 
                    variant="contained" 
                    onClick={handleScan} 
                    disabled={loading || scanState.status === 'complete'}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                    sx={{ minWidth: 200 }}
                  >
                    {loading ? 'Scanning...' : (
                        scanState.status === 'complete' 
                        ? "All books processed" 
                        : `Scan ${scanState.unprocessedCount} unprocessed photos`
                    )}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* After scan, show location as header and status */}
          {pipelineStatus !== 'initial' && (
            <Box mb={2}>
              <Typography variant="h5" gutterBottom>
                {selectedFolder}
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                {pipelineStatus === 'analysis' && 'Gemini scan complete. Review detected books below.'}
                {pipelineStatus === 'enrichment' && 'Enriching book data from external sources...'}
                {pipelineStatus === 'complete' && 'Enrichment complete. You may now manually edit details.'}
              </Alert>
            </Box>
          )}



          {books.length > 0 && (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box>
                    <Typography variant="h6">
                        {pipelineStatus === 'analysis' ? 'Verify Detected Books' : 'Enrichment & Review'}
                    </Typography>
                    <Typography variant="subtitle2" color="text.secondary">
                        {pipelineStatus === 'analysis' 
                          ? `Found ${books.length} books. Verify titles/authors below before enriching.` 
                          : (pipelineStatus === 'enrichment' 
                            ? (
                              <Box display="flex" alignItems="center" gap={2}>
                                <CircularProgress size={24} color="secondary" />
                                {`Enriching library... ${enrichmentProgress.current} / ${enrichmentProgress.total}`}
                              </Box>
                            )
                            : 'Data enrichment complete. You can now manually edit details.')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    {pipelineStatus === 'analysis' && (
                      <Button 
                          variant="contained" 
                          color="secondary"
                          onClick={handleStartEnrichment} 
                          startIcon={<AutoStoriesIcon />}
                      >
                          Get Enriched Information
                      </Button>
                    )}
                    {pipelineStatus === 'complete' && (
                       <Button 
                          variant="contained" 
                          color="secondary"
                          onClick={handleSyncToFirebase} 
                          startIcon={<CloudUploadIcon />}
                      >
                          Sync to Firebase
                      </Button>
                    )}
                  </Box>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell width={50}>Edit</TableCell>
                        <TableCell>{pipelineStatus === 'analysis' ? 'Detected Title' : 'Title'}</TableCell>
                        <TableCell>{pipelineStatus === 'analysis' ? 'Detected Author' : 'Author(s)'}</TableCell>
                        <TableCell>Image Source</TableCell>
                        
                        {(pipelineStatus === 'enrichment' || pipelineStatus === 'complete') && (
                            <>
                                <TableCell>Cover</TableCell>
                                <TableCell>Publisher</TableCell>
                                <TableCell>Year</TableCell>
                                <TableCell>ISBN</TableCell>
                                <TableCell>Source</TableCell>
                                <TableCell>Description</TableCell>
                            </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {books.map((book, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            {pipelineStatus === 'analysis' ? (
                                <IconButton onClick={() => handleOpenEdit(book, idx)} size="small">
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            ) : (
                                pipelineStatus === 'complete' && (
                                    <IconButton size="small" onClick={() => handleOpenManualEdit(book, idx)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                )
                            )}
                          </TableCell>
                          
                          <TableCell sx={{ color: (pipelineStatus !== 'analysis') ? 'text.secondary' : 'inherit' }}>
                              {book.title}
                          </TableCell>
                          <TableCell sx={{ color: (pipelineStatus !== 'analysis') ? 'text.secondary' : 'inherit' }}>
                              {Array.isArray(book.authors) ? book.authors.join(', ') : (book.authors || book.author)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {book.sources ? (Array.isArray(book.sources) ? book.sources.map(s => s.split('/').pop()).join(', ') : book.sources) : '-'}
                          </TableCell>

                          {(pipelineStatus === 'enrichment' || pipelineStatus === 'complete') && (
                            <>
                                <TableCell>
                                    {book.coverImage && <img src={book.coverImage} alt="Cover" style={{ height: 40 }} />}
                                </TableCell>
                                <TableCell>{book.publisher}</TableCell>
                                <TableCell>{book.publicationDate}</TableCell>
                                <TableCell>{book.isbn}</TableCell>
                                <TableCell>
                                    {book.sourceUrl && (
                                        <Typography component="a" href={book.sourceUrl} target="_blank" rel="noopener noreferrer" variant="caption">
                                            {book.source || 'Link'}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={{ maxWidth: 300, fontSize: '0.75rem' }}>
                                    {book.description}
                                </TableCell>
                            </>
                          )}
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


      {/* Enrichment Confirmation Dialog */}
      <Dialog open={showEnrichConfirm} onClose={() => setShowEnrichConfirm(false)}>
        <DialogTitle>Start Enrichment?</DialogTitle>
        <DialogContent>
            <Typography>
                Once you proceed, you cannot redo the initial Gemini image analysis for these books.
                We will fetch detailed metadata from Perplexity and Google Books.
            </Typography>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setShowEnrichConfirm(false)}>Cancel</Button>
            <Button onClick={handleConfirmEnrichment} variant="contained" color="primary">
                Get Enriched Information
            </Button>
        </DialogActions>
      </Dialog>


      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Redo Book Analysis</DialogTitle>
        <DialogContent>
            <Typography variant="body2" gutterBottom>
                Correcting: <strong>{editingBook?.title}</strong> by {editingBook?.author}
            </Typography>
            
            <Box mt={2}>
                <Typography variant="subtitle2" gutterBottom>
                    What's wrong?
                </Typography>
                <RadioGroup
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value)}
                >
                    <FormControlLabel value="title_wrong" control={<Radio />} label="Title is wrong" />
                    <FormControlLabel value="author_wrong" control={<Radio />} label="Author is wrong" />
                    <FormControlLabel value="both_wrong" control={<Radio />} label="Both are wrong" />
                </RadioGroup>
            </Box>

            <Box mt={2}>
                 <TextField
                    fullWidth
                    label="Additional Hints (Optional)"
                    multiline
                    rows={2}
                    variant="outlined"
                    value={feedbackDetails}
                    onChange={(e) => setFeedbackDetails(e.target.value)}
                    placeholder="e.g. 'The title starts with X', 'The author is Y'"
                    helperText="Providing a hint helps the AI identify the correct book from the image."
                 />
            </Box>
        </DialogContent>
        <DialogActions>
            <Button onClick={handleCloseEdit} disabled={reanalyzing}>Cancel</Button>
            <Button onClick={handleReanalyze} variant="contained" disabled={reanalyzing}>
                {reanalyzing ? 'Analyzing...' : 'Redo Analysis'}
            </Button>
        </DialogActions>
      </Dialog>


      {/* Manual Edit Dialog */}
      <Dialog open={manualEditDialogOpen} onClose={() => setManualEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Manual Book Edit</DialogTitle>
        <DialogContent>
            <Typography variant="body2" gutterBottom>
                Editing: <strong>{manualEditingBook?.title}</strong>
            </Typography>
            
            <Box mt={2} display="flex" flexDirection="column" gap={2}>
                 <TextField
                    disabled
                    label="Title (Read Only)"
                    variant="outlined"
                    value={manualEditingBook?.title || ''}
                    fullWidth
                 />
                 <TextField
                    disabled
                    label="Author (Read Only)"
                    variant="outlined"
                    value={Array.isArray(manualEditingBook?.authors) ? manualEditingBook.authors.join(', ') : (manualEditingBook?.authors || manualEditingBook?.author || '')}
                    fullWidth
                 />
                 <TextField
                    label="Publisher"
                    variant="outlined"
                    value={manualEditingBook?.publisher || ''}
                    onChange={(e) => setManualEditingBook({...manualEditingBook, publisher: e.target.value})}
                    fullWidth
                 />
                 <Box display="flex" gap={2}>
                    <TextField
                        label="Resulting ISBN"
                        variant="outlined"
                        value={manualEditingBook?.isbn || ''}
                        onChange={(e) => setManualEditingBook({...manualEditingBook, isbn: e.target.value})}
                        fullWidth
                    />
                    <TextField
                        label="Publication Date"
                        variant="outlined"
                        value={manualEditingBook?.publicationDate || ''}
                        onChange={(e) => setManualEditingBook({...manualEditingBook, publicationDate: e.target.value})}
                        fullWidth
                    />
                 </Box>
                  <TextField
                    label="Description"
                    multiline
                    rows={4}
                    variant="outlined"
                    value={manualEditingBook?.description || ''}
                    onChange={(e) => setManualEditingBook({...manualEditingBook, description: e.target.value})}
                    fullWidth
                 />
                 {manualEditingBook?.sourceUrl && (
                     <Typography variant="caption">
                         <a href={manualEditingBook.sourceUrl} target="_blank" rel="noreferrer">Reference: {manualEditingBook.source || 'Link'}</a>
                     </Typography>
                 )}
            </Box>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setManualEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleManualSave} variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
