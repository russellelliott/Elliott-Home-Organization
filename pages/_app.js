import { AuthProvider } from '../context/AuthContext';
import { BooksProvider } from '../context/BooksContext';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import AuthWrapper from '../components/AuthWrapper';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const mainRef = useRef(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [router.asPath]);

  return (
    <AuthProvider>
      <BooksProvider initialBooks={pageProps.books || []}>
        <AuthWrapper>
          <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f4f1e8' }}>
            <Navbar />
            <Box
              ref={mainRef}
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
