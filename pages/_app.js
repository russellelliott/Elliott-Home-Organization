import { AuthProvider } from '../context/AuthContext';
import AuthWrapper from '../components/AuthWrapper';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AuthWrapper>
        <Navbar />
        <Component {...pageProps} />
      </AuthWrapper>
    </AuthProvider>
  );
}

export default MyApp;
