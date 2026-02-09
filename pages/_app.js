import { AuthProvider } from '../context/AuthContext';
import AuthWrapper from '../components/AuthWrapper';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AuthWrapper>
        <Component {...pageProps} />
      </AuthWrapper>
    </AuthProvider>
  );
}

export default MyApp;
