
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
    } else {
        return res.status(200).json({ error: "No books found" });
    }

  } catch (error) {
    console.error("Google Books API Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
