import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/router';

const SIDEBAR_WIDTH = 280;

const libraryItems = [
  { label: 'All books', href: '/', icon: DashboardOutlinedIcon },
  { label: 'Upload', href: '/upload', icon: UploadFileOutlinedIcon },
  { label: 'Processing', href: '/processing', icon: HourglassBottomOutlinedIcon },
];

const toolItems = [
  { label: 'Enrich books', href: '/enrich-books', icon: AutoAwesomeOutlinedIcon },
  { label: 'Normalize authors', href: '/normalize-authors', icon: BadgeOutlinedIcon },
];

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();

  const navigateTo = (href) => {
    if (href === '/' && typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }

    router.push(href);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (!user) return null;

  const isBooksRoute = router.pathname === '/' || router.pathname.startsWith('/book/');

  const isActive = (href) => {
    if (href === '/') return isBooksRoute;
    return router.pathname === href;
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid rgba(17, 24, 39, 0.08)',
          background: 'linear-gradient(180deg, #214f9a 0%, #1f4a8f 100%)',
          color: '#f8fafc',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', px: 2.5, py: 3, gap: 2 }}>
        <Box
          sx={{ cursor: 'pointer' }}
          onClick={() => navigateTo('/')}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            Elliott Home Organizer
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(248, 250, 252, 0.78)', mt: 0.5 }}>
            Personal library
          </Typography>
        </Box>

        <Box>
          <Typography variant="overline" sx={{ color: 'rgba(248, 250, 252, 0.6)', letterSpacing: 1.2 }}>
            Library
          </Typography>
          <List disablePadding sx={{ mt: 1 }}>
            {libraryItems.map(({ label, href, icon: Icon }) => (
              <ListItemButton
                key={href}
                selected={isActive(href)}
                onClick={() => navigateTo(href)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  color: 'inherit',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  },
                  '&.Mui-selected:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box>
          <Typography variant="overline" sx={{ color: 'rgba(248, 250, 252, 0.6)', letterSpacing: 1.2 }}>
            Tools
          </Typography>
          <List disablePadding sx={{ mt: 1 }}>
            {toolItems.map(({ label, href, icon: Icon }) => (
              <ListItemButton
                key={href}
                selected={isActive(href)}
                onClick={() => navigateTo(href)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  color: 'inherit',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  },
                  '&.Mui-selected:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box sx={{ flexGrow: 1 }} />
        <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.14)' }} />
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pt: 1 }}>
          <Avatar src={user.photoURL || ''} alt="Profile" sx={{ width: 40, height: 40 }}>
            {user.displayName?.[0] || user.email?.[0] || 'R'}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {user.displayName || 'Signed in'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(248, 250, 252, 0.72)' }} noWrap>
              {user.email || 'Library access'}
            </Typography>
          </Box>
          <Button
            onClick={handleLogout}
            startIcon={<LogoutOutlinedIcon fontSize="small" />}
            sx={{
              color: 'inherit',
              textTransform: 'none',
              borderRadius: 2,
              px: 1.25,
              whiteSpace: 'nowrap',
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
