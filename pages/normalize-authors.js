import { useState } from "react";
import Head from "next/head";
import { Alert, Box, Button, CircularProgress, Container, Typography } from "@mui/material";

export default function NormalizeAuthorsPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function runNormalizeAuthors() {
    setRunning(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/normalize-authors", { method: "POST" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRunning(false);
    }
  }

  const checked = result?.checked || 0;
  const matched = result?.matched || 0;
  const updated = result?.updated || 0;
  const unchanged = result?.unchanged || 0;
  const errorCount = result?.errors?.length || 0;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Head>
        <title>Normalize Authors</title>
      </Head>

      <Typography variant="h4" gutterBottom>
        Normalize Authors
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Runs through your books collection and normalizes suspicious author lists with Gemini when a list has more than two entries or contains comma-separated names.
      </Typography>

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
        <Button variant="contained" onClick={runNormalizeAuthors} disabled={running}>
          Run Author Normalization
        </Button>
        {running && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Processing books...
            </Typography>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="success">
            Checked: {checked} | Matched: {matched} | Updated: {updated} | Unchanged: {unchanged} | Errors: {errorCount}
          </Alert>

          {errorCount > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1">Errors</Typography>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.errors, null, 2)}</pre>
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
}