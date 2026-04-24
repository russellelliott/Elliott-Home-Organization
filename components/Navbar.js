import { AppBar, Toolbar, Typography, Box, Button, Avatar } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/router';

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();

  const navigateHome = () => {
    router.prefetch('/');
    if (typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }
    router.push('/', undefined, { scroll: false });
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (!user) return null;

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography 
            variant="h6" 
            component="div" 
            sx={{ mr: 4, cursor: 'pointer' }}
            onClick={navigateHome}
        >
          Elliott Home Organizer
        </Typography>

        <Box sx={{ flexGrow: 1 }}>
            <Button color="inherit" onClick={navigateHome}>Books</Button>
            <Button color="inherit" onClick={() => router.push('/upload')}>Upload</Button>
            <Button color="inherit" onClick={() => router.push('/processing')}>Processing</Button>
          <Button color="inherit" onClick={() => router.push('/enrich-books')}>Enrich Existing Books</Button>
          <Button color="inherit" onClick={() => router.push('/normalize-authors')}>Normalize Authors</Button>
        </Box>

        <Box display="flex" alignItems="center" gap={2}>
          {user.photoURL && <Avatar src={user.photoURL} alt="Profile" />}
          <Button color="inherit" onClick={handleLogout}>Sign Out</Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
