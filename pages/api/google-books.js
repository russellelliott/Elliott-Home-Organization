
function cleanTitle(title) {
    if (!title) return title;
    // Remove " - Part X", " Part X", " - Vol. X", " Vol. X"
    return title.replace(/(\s*-\s*)?(Part|Vol|Volume)\.?\s*\d+.*$/i, '').trim();
}

async function searchGoogleBooks(title, author, apiKey) {
    let query = `intitle:"${title}"`;
    if (author && author !== 'Unknown') {
        query += `+inauthor:"${author}"`;
    }
    
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.items || [];
    } catch (e) {
        console.error("Error fetching from Google Books:", e);
        return [];
    }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { title, author } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Book title is required' });
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // 1. Precise search
    let items = await searchGoogleBooks(title, author, apiKey);

    // 2. Retry with cleaned title (removing " Part 1", etc.)
    const cleanedTitle = cleanTitle(title);
    if (items.length === 0 && cleanedTitle !== title && cleanedTitle.length > 0) {
        console.log(`Google Books: Retrying with cleaned title: "${cleanedTitle}"`);
        items = await searchGoogleBooks(cleanedTitle, author, apiKey);
    }

    // 3. Retry without author (using original title)
    // Sometimes OCR author is messy or strict match fails
    if (items.length === 0 && author && author !== 'Unknown') {
        console.log(`Google Books: Retrying without author constraint: "${title}"`);
        items = await searchGoogleBooks(title, null, apiKey);
    }

    // 4. Retry without author (using cleaned title)
    if (items.length === 0 && author && author !== 'Unknown' && cleanedTitle !== title && cleanedTitle.length > 0) {
        console.log(`Google Books: Retrying cleaned title without author constraint: "${cleanedTitle}"`);
        items = await searchGoogleBooks(cleanedTitle, null, apiKey);
    }

    if (items.length > 0) {
        const book = items[0].volumeInfo;
        const result = {
            source: 'Google Books',
            title: book.title,
            authors: book.authors || [],
            publisher: book.publisher,
            publishedDate: book.publishedDate,
            description: book.description,
            pageCount: book.pageCount,
            categories: book.categories,
            thumbnail: book.imageLinks?.thumbnail || book.imageLinks?.smallThumbnail,
            infoLink: book.infoLink,
            canonicalVolumeLink: book.canonicalVolumeLink,
            isbn: book.industryIdentifiers?.find(id => id.type === "ISBN_13")?.identifier || 
                  book.industryIdentifiers?.find(id => id.type === "ISBN_10")?.identifier
        };
        return res.status(200).json(result);
    } 
    
    // Fallback: Open Library API
    console.log(`Google Books found no results for "${title}". Trying Open Library...`);
    
    let olQuery = `title=${encodeURIComponent(title)}`;
    if (author && author !== 'Unknown') {
        olQuery += `&author=${encodeURIComponent(author)}`;
    }

    const olUrl = `https://openlibrary.org/search.json?${olQuery}&limit=1`;
    const olResponse = await fetch(olUrl);
    const olData = await olResponse.json();

    if (olData.docs && olData.docs.length > 0) {
        const searchDoc = olData.docs[0];
        console.log("Open Library Search Doc:", JSON.stringify(searchDoc, null, 2));
        
        let detailedBook = null;
        let description = null;

        if (searchDoc.key) {
             try {
                // If it's a Work, we need to fetch an Edition to get ISBN/Publisher specs
                if (searchDoc.key.startsWith('/works/')) {
                     const editionsUrl = `https://openlibrary.org${searchDoc.key}/editions.json?limit=1`;
                     const workUrl = `https://openlibrary.org${searchDoc.key}.json`;
                     
                     const [editionsRes, workRes] = await Promise.all([
                        fetch(editionsUrl),
                        fetch(workUrl)
                     ]);

                     if (editionsRes.ok) {
                        const editionsData = await editionsRes.json();
                        if (editionsData.entries && editionsData.entries.length > 0) {
                            detailedBook = editionsData.entries[0];
                            console.log("Open Library Detailed Edition:", JSON.stringify(detailedBook, null, 2));
                        }
                     }
                     
                     if (workRes.ok) {
                        const workData = await workRes.json();
                        if (workData.description) {
                             description = typeof workData.description === 'string' 
                                ? workData.description 
                                : workData.description.value;
                        }
                     }
                } else {
                    // It might be a direct book key
                     const detailsUrl = `https://openlibrary.org${searchDoc.key}.json`;
                     const detailsRes = await fetch(detailsUrl);
                     if (detailsRes.ok) {
                         detailedBook = await detailsRes.json();
                         console.log("Open Library Detailed Book:", JSON.stringify(detailedBook, null, 2));
                     }
                }
             } catch (err) {
                 console.error("Error fetching Open Library details:", err);
             }
        }

        // Merge sources: Detailed Edition > Search Doc
        const finalData = detailedBook || {};

        const result = {
            source: 'Open Library',
            title: finalData.title || searchDoc.title,
            // Search doc typically has flattened author names. Detailed book has author keys.
            authors: searchDoc.author_name || [], 
            publisher: finalData.publishers ? finalData.publishers[0] : (searchDoc.publisher ? searchDoc.publisher[0] : null),
            publishedDate: finalData.publish_date || (searchDoc.first_publish_year ? searchDoc.first_publish_year.toString() : null),
            description: description || null, 
            pageCount: finalData.number_of_pages || searchDoc.number_of_pages_median || null,
            categories: searchDoc.subject ? searchDoc.subject.slice(0, 3) : [],
            thumbnail: finalData.covers && finalData.covers.length > 0 && finalData.covers[0] !== -1
                ? `https://covers.openlibrary.org/b/id/${finalData.covers[0]}-M.jpg` 
                : (searchDoc.cover_i ? `https://covers.openlibrary.org/b/id/${searchDoc.cover_i}-M.jpg` : null),
            
            infoLink: `https://openlibrary.org${searchDoc.key}`,
            canonicalVolumeLink: `https://openlibrary.org${searchDoc.key}`,
            
            isbn: (() => {
                // Priority: Detailed Object ISBN 13 -> 10 -> Search Doc Generic
                if (finalData.isbn_13 && finalData.isbn_13.length > 0) return finalData.isbn_13[0];
                if (finalData.isbn_10 && finalData.isbn_10.length > 0) return finalData.isbn_10[0];
                
                if (searchDoc.isbn && Array.isArray(searchDoc.isbn)) {
                    const found13 = searchDoc.isbn.find(i => i.length === 13);
                    return found13 || searchDoc.isbn[0];
                }
                return null;
            })()
        };

        return res.status(200).json(result);
    }

    return res.status(200).json({ error: "No books found" });


  } catch (error) {
    console.error("Google Books API Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
