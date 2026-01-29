import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '@/styles/Home.module.css';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState('Espana Ct Office');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState({});
  const [gpsData, setGpsData] = useState(null);
  const [extractingGps, setExtractingGps] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const folders = ["Espana Ct Office", "Santa Cruz Cottage"];

  const handleExtractGPS = async () => {
    setExtractingGps(true);
    setGpsData(null);
    try {
      const res = await fetch('/api/extract-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: selectedFolder }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setGpsData(data); // Show data immediately

         // Reverse geocode via REST API
        if (data.gpsData && data.gpsData.length > 0) {
            const updatedGpsList = [...data.gpsData];
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

            for (let i = 0; i < updatedGpsList.length; i++) {
                const item = updatedGpsList[i];
                try {
                  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${item.latitude},${item.longitude}&key=${apiKey}`);
                  const geoData = await geoRes.json();
                  
                  if (geoData.status === 'OK' && geoData.results[0]) {
                     updatedGpsList[i] = { ...item, address: geoData.results[0].formatted_address };
                  } else {
                     updatedGpsList[i] = { ...item, address: `Lookup failed: ${geoData.status}` };
                  }

                } catch (err) {
                    console.error('Error reverse geocoding:', item.fileName, err);
                    updatedGpsList[i] = { ...item, address: 'Lookup failed' };
                }
            }
            // Update state with addresses
            setGpsData(prev => ({ ...prev, gpsData: updatedGpsList }));
        }

      } else {
        alert(data.message || 'Failed to extract GPS data');
      }
    } catch (error) {
      console.error('Error extracting GPS:', error);
      alert('An error occurred during GPS extraction');
    } finally {
      setExtractingGps(false);
    }
  };

  const handleScan = async () => {
    setLoading(true);
    setBooks([]);
    setEnrichedData({});
    try {
      const res = await fetch('/api/scan-shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: selectedFolder }),
      });
      const data = await res.json();
      if (res.ok) {
        setBooks(data.books);
      } else {
        alert(data.message || 'Scan failed');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred during scanning');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    // Don't clear old enriched data, just add to it
    
    // Process in batches
    for (const book of books) {
      if (enrichedData[book.title]) continue; // Skip if already done

      try {
        const res = await fetch('/api/enrich-book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: book.title, author: book.author }),
        });
        const details = await res.json();
        
        setEnrichedData(prev => ({ ...prev, [book.title]: details }));
      } catch (e) {
        console.error("Failed to enrich", book.title);
        setEnrichedData(prev => ({ ...prev, [book.title]: { error: true } }));
      }
    }
    setEnriching(false);
  };

  if (authLoading) return <div style={{display:'flex', justifyContent:'center', marginTop:'50px'}}>Loading...</div>;

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '2rem' }}>
        <Head>
          <title>Elliott Home Organization</title>
          <meta name="description" content="Sign in to access Elliott Home Organization" />
        </Head>
        <h1>Elliott Home Organization</h1>
        <button 
          onClick={handleLogin}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '5px'
          }}
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
          </svg>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Elliott Home Organizer</title>
        <meta name="description" content="Scan bookshelves and get details" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={styles.page}>
        <main className={styles.main}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '20px' }}>
            <h1>Elliott Home Organizer</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               {user.photoURL && <img src={user.photoURL} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />}
               <button onClick={handleLogout} style={{ padding: '5px 10px', cursor: 'pointer' }}>Sign Out</button>
            </div>
          </div>
          
          <div style={{ marginBottom: '2rem', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h2>Step 1: Select Location</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select 
                value={selectedFolder} 
                onChange={(e) => setSelectedFolder(e.target.value)}
                style={{ padding: '0.5rem', fontSize: '1rem', flexGrow: 1 }}
              >
                {folders.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button 
                onClick={handleScan} 
                disabled={loading}
                style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: loading ? 'wait' : 'pointer' }}
              >
                {loading ? 'Scanning Images...' : 'Scan For Books'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '2rem', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
            <h2>GPS Location Extraction</h2>
            <p>Extract GPS coordinates from all images in <strong>{selectedFolder}</strong>:</p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <button
                onClick={handleExtractGPS}
                disabled={extractingGps}
                style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: extractingGps ? 'wait' : 'pointer' }}
              >
                {extractingGps ? 'Extracting GPS data...' : 'Get GPS for Folder'}
              </button>
            </div>
            
            {gpsData && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '4px' }}>
                <h3>Extracted GPS Data ({gpsData.gpsData.length} images with GPS):</h3>
                <p>Checked {gpsData.imageCount} images in {gpsData.folder}.</p>
                {gpsData.gpsData.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            <th style={{ padding: '8px' }}>File</th>
                            <th style={{ padding: '8px' }}>Latitude</th>
                            <th style={{ padding: '8px' }}>Longitude</th>
                            <th style={{ padding: '8px' }}>Address</th>
                            <th style={{ padding: '8px' }}>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gpsData.gpsData.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '8px' }}>{item.fileName}</td>
                                <td style={{ padding: '8px' }}>{item.latitude.toFixed(6)}</td>
                                <td style={{ padding: '8px' }}>{item.longitude.toFixed(6)}</td>
                                <td style={{ padding: '8px' }}>{item.address || 'Loading...'}</td>
                                <td style={{ padding: '8px' }}>{item.dateStamp} {item.timeStamp}</td>
                            </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: '#666' }}>No GPS coordinates found in any images.</p>
                )}
              </div>
            )}
          </div>

          {books.length > 0 && (
            <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
              <h2>Step 2: Review & Enrich</h2>
              <div style={{display:'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <p>Found <strong>{books.length}</strong> books.</p>
                <button 
                    onClick={handleEnrich} 
                    disabled={enriching}
                    style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: enriching ? 'wait' : 'pointer', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    {enriching ? 'Fetching Details from Perplexity...' : 'Get Details (ISBN, Publisher, etc.)'}
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eaeaea', backgroundColor: '#333', color: '#fff' }}>
                    <th style={{ padding: '10px' }}>Detected Title</th>
                    <th style={{ padding: '10px' }}>Detected Author</th>
                    <th style={{ padding: '10px' }}>Image Source</th>
                    <th style={{ padding: '10px' }}>Details (Perplexity)</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eaeaea' }}>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>{book.title}</td>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>{book.author}</td>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>
                        {book.sources ? (Array.isArray(book.sources) ? book.sources.join(', ') : book.sources) : '-'}
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.9em', verticalAlign: 'top' }}>
                        {enrichedData[book.title] ? (
                          enrichedData[book.title].error ? (
                            <span style={{color:'red'}}>Error fetching details</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              <li><strong>Authors:</strong> {enrichedData[book.title].authors}</li>
                              <li><strong>ISBN:</strong> {enrichedData[book.title].isbn}</li>
                              <li><strong>Publisher:</strong> {enrichedData[book.title].publisher}</li>
                              <li><strong>Year:</strong> {enrichedData[book.title].publicationDate}</li>
                              <li><strong>Edition:</strong> {enrichedData[book.title].edition}</li>
                            </ul>
                          )
                        ) : (
                          <span style={{ color: '#888' }}>{enriching ? 'Pending...' : '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
