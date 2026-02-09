import Head from 'next/head';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Button,
  Container,
  Box,
  Typography
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';

export default function Login() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        });
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
      <Container maxWidth="sm">
        <Head>
          <title>Elliott Home Organization</title>
          <meta name="description" content="Sign in to access Elliott Home Organization" />
        </Head>
        <Box 
          display="flex" 
          flexDirection="column" 
          alignItems="center" 
          justifyContent="center" 
          minHeight="100vh" 
          gap={4}
        >
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Elliott Home Organization
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<GoogleIcon />} 
            onClick={handleLogin}
            size="large"
          >
            Sign in with Google
          </Button>
        </Box>
      </Container>
  );
}
