import { AuthProvider } from '../context/AuthContext';
import { BooksProvider } from '../context/BooksContext';
import { useRouter } from 'next/router';
import AuthWrapper from '../components/AuthWrapper';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();

  return (
    <AuthProvider>
      <BooksProvider initialBooks={pageProps.books || []}>
        <AuthWrapper>
          <Navbar />
          <Component key={router.asPath} {...pageProps} />
        </AuthWrapper>
      </BooksProvider>
    </AuthProvider>
  );
}

export default MyApp;
