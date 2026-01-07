import { useState } from 'react';
import Head from 'next/head';
import styles from '@/styles/Home.module.css';

export default function Home() {
  const [selectedFolder, setSelectedFolder] = useState('Espana Ct Office');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState({});

  const folders = ["Espana Ct Office", "Santa Cruz Cottage"];

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

  return (
    <>
      <Head>
        <title>Bookshelf Scanner</title>
        <meta name="description" content="Scan bookshelves and get details" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>Bookshelf Scanner</h1>
          
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
                    <th style={{ padding: '10px' }}>Details (Perplexity)</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eaeaea' }}>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>{book.title}</td>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>{book.author}</td>
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
