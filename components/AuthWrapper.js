import { useAuth } from '../context/AuthContext';
import { CircularProgress, Box } from '@mui/material';
import Login from './Login';

export default function AuthWrapper({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Login />;
  }

  return children;
}
