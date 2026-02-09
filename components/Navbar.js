import { AppBar, Toolbar, Typography, Box, Button, Avatar } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/router';

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();

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
            sx={{ flexGrow: 1, cursor: 'pointer' }}
            onClick={() => router.push('/')}
        >
          Elliott Home Organizer
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          {user.photoURL && <Avatar src={user.photoURL} alt="Profile" />}
          <Button color="inherit" onClick={handleLogout}>Sign Out</Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
