
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

    let query = `intitle:"${title}"`;
    if (author && author !== 'Unknown') {
        query += `+inauthor:"${author}"`;
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=1`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
        const book = data.items[0].volumeInfo;
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
        const book = olData.docs[0];
        const result = {
            source: 'Open Library',
            title: book.title,
            authors: book.author_name || [],
            publisher: book.publisher ? book.publisher[0] : null,
            publishedDate: book.first_publish_year ? book.first_publish_year.toString() : null,
            description: null, 
            pageCount: book.number_of_pages_median || null,
            categories: book.subject ? book.subject.slice(0, 3) : [],
            thumbnail: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
            infoLink: `https://openlibrary.org${book.key}`,
            canonicalVolumeLink: `https://openlibrary.org${book.key}`,
            isbn: book.isbn ? book.isbn[0] : null
        };

        // Try to fetch description from the Works API
        if (book.key) {
             try {
                const workRes = await fetch(`https://openlibrary.org${book.key}.json`);
                if (workRes.ok) {
                    const workData = await workRes.json();
                    if (workData.description) {
                         result.description = typeof workData.description === 'string' 
                            ? workData.description 
                            : workData.description.value;
                    }
                }
             } catch (err) {
                 console.error("Open Library Work fetch failed", err);
             }
        }

        return res.status(200).json(result);
    }

    return res.status(200).json({ error: "No books found" });


  } catch (error) {
    console.error("Google Books API Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
