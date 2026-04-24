import { AuthProvider } from '../context/AuthContext';
import { BooksProvider } from '../context/BooksContext';
import { useRouter } from 'next/router';
import { Box } from '@mui/material';
import AuthWrapper from '../components/AuthWrapper';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();

  return (
    <AuthProvider>
      <BooksProvider initialBooks={pageProps.books || []}>
        <AuthWrapper>
          <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f4f1e8' }}>
            <Navbar />
            <Box
              component="main"
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: 'auto',
                display: 'flex'
              }}
            >
              <Component key={router.asPath} {...pageProps} />
            </Box>
          </Box>
        </AuthWrapper>
      </BooksProvider>
    </AuthProvider>
  );
}

export default MyApp;
