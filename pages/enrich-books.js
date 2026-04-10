import { useState } from 'react';
import Head from 'next/head';
import { Button, Container, Typography, Box, CircularProgress, Alert } from '@mui/material';

export default function EnrichBooksPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const processedCount = result
    ? (result.updated || 0) + (result.skipped || 0) + ((result.errors && result.errors.length) || 0)
    : 0;

  async function runEnrich() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/enrich-existing-books', { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Head>
        <title>Enrich Existing Books</title>
      </Head>

      <Typography variant="h4" gutterBottom>
        Enrich Existing Books
      </Typography>

      <Typography sx={{ mb: 2 }}>
        This will attempt to fetch cover images and page counts for books in your Firestore `books` collection.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <Button variant="contained" color="primary" onClick={runEnrich} disabled={running}>
          Run Enrichment
        </Button>
        {running && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">Processing books...</Typography>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="success">
            Processed: {processedCount} books | Updated: {result.updated || 0} | Skipped: {result.skipped || 0} | Errors: {(result.errors && result.errors.length) || 0}
          </Alert>
          {result.errors && result.errors.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1">Errors</Typography>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result.errors, null, 2)}</pre>
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
}
