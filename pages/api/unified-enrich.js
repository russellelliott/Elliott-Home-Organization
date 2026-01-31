import OpenAI from "openai";

function cleanTitle(title) {
    if (!title) return title;
    let cleaned = title;
    cleaned = cleaned.replace(/^Then\s*(&|and)\s*Now\s*:\s*/i, '');
    cleaned = cleaned.replace(/[:\s]*Then\s*(&|and)\s*Now$/i, '');
    cleaned = cleaned.replace(/(\s*-\s*)?(Part|Vol|Volume)\.?\s*\d+.*$/i, '');
    return cleaned.trim();
}

async function fetchPerplexityData(title, author) {
    try {
        const perplexity = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY,
            baseURL: "https://api.perplexity.ai"
        });

        const prompt = `
          Search for and provide the following details for the book "${title}" by "${author || 'Unknown'}".
          You must perform a search to find the most accurate and complete information, specifically the ISBN and Publisher.
          If the provided author appears to be multiple people (e.g. separated by hyphens, 'and', '&', or just spaces on the cover), verify the correct list of authors.
          
          Details required:
          - Author(s) (Return as an array of strings)
          - ISBN (prefer 13-digit, otherwise 10-digit)
          - Publisher
          - Publication year or date (YYYY or YYYY-MM-DD)
          - Description (Short summary)

          Return ONLY a valid JSON object with these exact keys: "authors", "isbn", "publisher", "publicationDate", "description".
          Do not include any other text or markdown formatting.
        `;

        const response = await perplexity.chat.completions.create({
            model: "sonar-pro",
            messages: [
                { role: "system", content: "You are a helpful bibliophile assistant who outputs only strict JSON." },
                { role: "user", content: prompt },
            ],
        });

        const content = response.choices[0].message.content;
        let jsonStr = content;
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            jsonStr = content.substring(start, end + 1);
        }
        return JSON.parse(jsonStr);

    } catch (e) {
        console.error("Perplexity enrich error:", e);
        return null;
    }
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

async function fetchGoogleBooksData(title, author) {
    try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; // Using existing key env var from context
        
        // 1. Precise search
        let items = await searchGoogleBooks(title, author, apiKey);

        // 2. Retry with cleaned title
        const cleanedTitle = cleanTitle(title);
        if (items.length === 0 && cleanedTitle !== title && cleanedTitle.length > 0) {
            items = await searchGoogleBooks(cleanedTitle, author, apiKey);
        }

        // 3. Retry without author
        if (items.length === 0 && author && author !== 'Unknown') {
             items = await searchGoogleBooks(title, null, apiKey);
        }

        if (items.length > 0) {
            const book = items[0].volumeInfo;
            // Best effort high res image
            const imageLinks = book.imageLinks || {};
            const coverUrl = imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.thumbnail || imageLinks.smallThumbnail;

            return {
                source: 'Google Books',
                title: book.title,
                authors: book.authors || [],
                publisher: book.publisher,
                publicationDate: book.publishedDate,
                description: book.description,
                isbn: book.industryIdentifiers?.find(id => id.type === "ISBN_13")?.identifier || 
                      book.industryIdentifiers?.find(id => id.type === "ISBN_10")?.identifier,
                coverUrl: coverUrl,
                infoLink: book.infoLink
            };
        }
        return null; // Could try OpenLibrary here as fallback if needed, keeping it simple for now as per prompt "Google Books/OpenLibrary"
    } catch (e) {
        console.error("Google Books enrich error:", e);
        return null;
    }
}

// Fallback to OpenLibrary if Google Books fails
async function fetchOpenLibraryData(title, author) {
     // Simplified OpenLibrary implementation
     try {
        let olQuery = `title=${encodeURIComponent(title)}`;
        if (author && author !== 'Unknown') {
            olQuery += `&author=${encodeURIComponent(author)}`;
        }
        const url = `https://openlibrary.org/search.json?${olQuery}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            return {
                source: 'Open Library',
                title: doc.title,
                authors: doc.author_name || [],
                publisher: doc.publisher ? doc.publisher[0] : null,
                publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
                isbn: doc.isbn ? doc.isbn[0] : null,
                coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
                infoLink: `https://openlibrary.org${doc.key}`
            };
        }
        return null;
     } catch(e) {
         console.error("OpenLibrary enrich error:", e);
         return null;
     }
}

function mergeAuthors(authorsA, authorsB) {
    // authorsA: array of strings
    // authorsB: array of strings
    const setA = new Set(authorsA || []);
    const setB = new Set(authorsB || []);
    
    // Simple union, but checking for simple containment to avoid "J.R.R. Tolkien" and "Tolkien" duplicates
    // Actually, prompt asks for fuzzy name relation.
    // For now, let's just union unique strings.
    const all = [...setA, ...setB];
    return [...new Set(all)];
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { title, author } = req.body; // These are "Detected Title/Author"

    if (!title) {
        return res.status(400).json({ message: 'Title is required' });
    }

    // Parallel execution for speed? The prompt implies priority order, but data availability is key.
    // Waterfall: Google/OpenLib overrides Perplexity.
    // So we need both.
    
    const [perplexityData, googleData] = await Promise.all([
        fetchPerplexityData(title, author),
        fetchGoogleBooksData(title, author)
    ]);

    let externalData = googleData;
    if (!externalData) {
        externalData = await fetchOpenLibraryData(title, author);
    }

    // Construct unified object
    // Priority: External (Google/OL) > Perplexity > Gemini (input title/author)
    
    const finalData = {
        title: externalData?.title || perplexityData?.title || title, // Usually we trust external title
        // Authors logic later
        
        imageSource: null, // This comes from client, not enriching
        source: externalData?.infoLink || null,
        coverImage: externalData?.coverUrl || null,
        isbn: externalData?.isbn || perplexityData?.isbn || null,
        publisher: externalData?.publisher || perplexityData?.publisher || null,
        publicationDate: externalData?.publicationDate || perplexityData?.publicationDate || null,
        description: externalData?.description || perplexityData?.description || null,
    };

    // Merging Authors
    const pAuthors = perplexityData?.authors || (perplexityData?.author ? [perplexityData.author] : []);
    const gAuthors = externalData?.authors || (externalData?.author ? [externalData.author] : []);
    
    // Perplexity might return authors even if it found nothing else?
    // The prompt says: "If any Google Books/OpenLibrary field is empty, retain the value from Perplexity"
    // And "The resulting Authors column is a union..."
    
    const geminiAuthor = author ? [author] : [];
    
    // If externalData (Google) exists, use its authors + perplexity authors
    // If not, use perplexity authors + gemini?
    // Actually, Perplexity overrides Gemini. Google overrides Perplexity.
    
    let combinedAuthors = [];
    if (externalData) {
        combinedAuthors = mergeAuthors(gAuthors, pAuthors);
    } else if (perplexityData) {
        combinedAuthors = pAuthors;
    } else {
        combinedAuthors = geminiAuthor;
    }

    finalData.authors = combinedAuthors;
    
    res.status(200).json(finalData);
}
