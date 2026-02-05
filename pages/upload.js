
import { useState } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Button, 
  Paper, 
  CircularProgress, 
  Alert,
  Card,
  CardMedia,
  CardContent
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Upload Photo
      </Typography>
      
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <input
          accept="image/*"
          style={{ display: 'none' }}
          id="raised-button-file"
          type="file"
          onChange={handleFileSelect}
        />
        <label htmlFor="raised-button-file">
          <Button 
            variant="outlined" 
            component="span" 
            startIcon={<CloudUploadIcon />}
            size="large"
          >
            Select Image
          </Button>
        </label>

        {selectedFile && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <Card sx={{ maxWidth: 400, mb: 2 }}>
                <CardMedia
                    component="img"
                    image={previewUrl}
                    alt="Preview"
                    sx={{ maxHeight: 300, objectFit: 'contain' }}
                />
                <CardContent>
                    <Typography variant="body2" color="text.secondary">
                        {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </Typography>
                </CardContent>
             </Card>

             <Button 
                variant="contained" 
                onClick={handleUpload} 
                disabled={uploading}
                size="large"
             >
                {uploading ? <CircularProgress size={24} /> : 'Upload to Firebase'}
             </Button>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Upload Complete! <br />
            <strong>Hash:</strong> {result.hash} <br />
            <strong>Status:</strong> {result.exists ? 'Deduplicated (Already Existed)' : 'New Upload'}
          </Alert>
        )}
      </Paper>
    </Container>
  );
}
