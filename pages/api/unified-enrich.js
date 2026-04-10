import OpenAI from "openai";

function toCleanArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function mergeUniqueStrings(...lists) {
    const out = [];
    const seen = new Set();
    for (const list of lists) {
        for (const item of toCleanArray(list)) {
            if (!seen.has(item)) {
                seen.add(item);
                out.push(item);
            }
        }
    }
    return out;
}

function isMissingField(data, fieldName) {
    if (!data) return true;

    if (fieldName === 'authors') {
        return !Array.isArray(data.authors) || data.authors.length === 0;
    }
    if (fieldName === 'coverUrls') {
        return !Array.isArray(data.coverUrls) || data.coverUrls.length === 0;
    }
    if (fieldName === 'pageCount') {
        return typeof data.pageCount !== 'number' || data.pageCount <= 0;
    }

    const value = data[fieldName];
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

const BACKFILL_FIELDS = ['coverUrls', 'isbn', 'publisher', 'publicationDate', 'authors', 'pageCount', 'description'];

function needsOpenLibraryBackfill(googleData) {
    if (!googleData) return true;
    return BACKFILL_FIELDS.some(field => isMissingField(googleData, field));
}

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

        // 4. Retry without author with cleaned title
        if (items.length === 0 && author && author !== 'Unknown' && cleanedTitle !== title && cleanedTitle.length > 0) {
             items = await searchGoogleBooks(cleanedTitle, null, apiKey);
        }

        if (items.length > 0) {
            const book = items[0].volumeInfo;
            // Collect all cover images
            const coverUrls = [];
            const imageLinks = book.imageLinks || {};
            if (imageLinks.extraLarge) coverUrls.push(imageLinks.extraLarge);
            if (imageLinks.large) coverUrls.push(imageLinks.large);
            if (imageLinks.medium) coverUrls.push(imageLinks.medium);
            if (imageLinks.thumbnail) coverUrls.push(imageLinks.thumbnail);
            if (imageLinks.smallThumbnail) coverUrls.push(imageLinks.smallThumbnail);

            return {
                source: 'Google Books',
                title: book.title,
                authors: book.authors || [],
                publisher: book.publisher,
                publicationDate: book.publishedDate,
                description: book.description,
                isbn: book.industryIdentifiers?.find(id => id.type === "ISBN_13")?.identifier || 
                      book.industryIdentifiers?.find(id => id.type === "ISBN_10")?.identifier,
                coverUrls: coverUrls,
                pageCount: book.pageCount || null,
                infoLink: book.infoLink || book.canonicalVolumeLink || null
            };
        }
        return null;
    } catch (e) {
        console.error("Google Books enrich error:", e);
        return null;
    }
}

async function fetchOpenLibraryByISBN(isbn) {
    if (!isbn) return null;
    try {
        const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=1`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.docs || data.docs.length === 0) return null;
        const doc = data.docs[0];

        const coverUrls = [];
        if (doc.cover_i) {
            coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
            coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
            coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`);
        }

        return {
            source: 'Open Library',
            title: doc.title || null,
            authors: doc.author_name || [],
            publisher: doc.publisher ? doc.publisher[0] : null,
            publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
            isbn: doc.isbn ? (doc.isbn.find(v => v && v.length === 13) || doc.isbn[0]) : null,
            coverUrls,
            pageCount: doc.number_of_pages || doc.number_of_pages_median || null,
            description: null,
            infoLink: doc.key ? `https://openlibrary.org${doc.key}` : null,
            sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : null
        };
    } catch (e) {
        console.error("OpenLibrary ISBN enrich error:", e);
        return null;
    }
}

// OpenLibrary lookup by title + author
async function fetchOpenLibraryData(title, author) {
     // Simplified OpenLibrary implementation
     try {
        let olQuery = `title=${encodeURIComponent(title)}`;
        if (author && author !== 'Unknown') {
            olQuery += `&author=${encodeURIComponent(author)}`;
        }
        const url = `https://openlibrary.org/search.json?${olQuery}&limit=1`;
           const res = await fetch(url, {
               headers: { 'User-Agent': 'ElliottHomeOrg/1.0 (contact: russ.elliott001@gmail.com)' }
           });
        const data = await res.json();
        
        if (data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            
            const coverUrls = [];
            if (doc.cover_i) {
                coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
                coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
                coverUrls.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`);
            }

            return {
                source: 'Open Library',
                title: doc.title,
                authors: doc.author_name || [],
                publisher: doc.publisher ? doc.publisher[0] : null,
                publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
                isbn: doc.isbn ? doc.isbn[0] : null,
                coverUrls: coverUrls,
                pageCount: doc.number_of_pages || doc.number_of_pages_median || null,
                infoLink: `https://openlibrary.org${doc.key}`,
                sourceUrl: `https://openlibrary.org${doc.key}`
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

async function mergeAuthorsFuzzy(authorsA, authorsB) {
    // Merge two arrays of author names, keeping the most detailed version of each unique name
    const allAuthors = [...(authorsA || []), ...(authorsB || [])];
    if (allAuthors.length === 0) return [];
    if (allAuthors.length === 1) return allAuthors;

    // Use LLM to cluster and select the most detailed version for each unique author
    try {
        const openai = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY,
            baseURL: "https://api.perplexity.ai"
        });
        const prompt = `Given the following list of author names, group together names that refer to the same person (even if formatted differently or with/without middle initials). For each group, return the single most detailed version of the name (the one with the most information, e.g., full middle names/initials). Return a JSON array of the selected names, no extra text.\n\nAuthors: ${JSON.stringify(allAuthors)}`;
        const response = await openai.chat.completions.create({
            model: "sonar-pro",
            messages: [
                { role: "system", content: "You are a helpful assistant that outputs only strict JSON." },
                { role: "user", content: prompt },
            ],
        });
        const content = response.choices[0].message.content;
        let jsonStr = content;
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
            jsonStr = content.substring(start, end + 1);
        }
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("mergeAuthorsFuzzy LLM error:", e);
        // Fallback: naive merge, prefer longest string for each unique base name
        const byBase = {};
        for (const name of allAuthors) {
            const base = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (!byBase[base] || name.length > byBase[base].length) {
                byBase[base] = name;
            }
        }
        return Object.values(byBase);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { title, author } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Title is required' });
    }

    const [perplexityData, googleData] = await Promise.all([
        fetchPerplexityData(title, author),
        fetchGoogleBooksData(title, author)
    ]);

    let openLibraryData = null;
    const shouldQueryOpenLibrary = needsOpenLibraryBackfill(googleData);

    if (shouldQueryOpenLibrary) {
        const isbnToUse = firstNonEmpty(googleData?.isbn, perplexityData?.isbn);
        if (isbnToUse) {
            openLibraryData = await fetchOpenLibraryByISBN(isbnToUse);
        }

        if (!openLibraryData) {
            const cleaned = cleanTitle(title);
            openLibraryData = await fetchOpenLibraryData(cleaned || title, author);
        }

        if (!openLibraryData && author) {
            openLibraryData = await fetchOpenLibraryData(title, null);
        }
    }

    const mergedExternal = {
        title: firstNonEmpty(googleData?.title, openLibraryData?.title),
        coverUrls: (googleData?.coverUrls && googleData.coverUrls.length > 0)
            ? googleData.coverUrls
            : (openLibraryData?.coverUrls || []),
        pageCount: (googleData?.pageCount && googleData.pageCount > 0)
            ? googleData.pageCount
            : (openLibraryData?.pageCount || null),
        isbn: firstNonEmpty(googleData?.isbn, openLibraryData?.isbn),
        publisher: firstNonEmpty(googleData?.publisher, openLibraryData?.publisher),
        publicationDate: firstNonEmpty(googleData?.publicationDate, openLibraryData?.publicationDate),
        description: firstNonEmpty(googleData?.description, openLibraryData?.description),
        authors: mergeUniqueStrings(googleData?.authors || [], openLibraryData?.authors || [])
    };

    const sources = mergeUniqueStrings(
        googleData?.infoLink ? [googleData.infoLink] : [],
        openLibraryData?.infoLink ? [openLibraryData.infoLink] : []
    );

    const finalData = {
        title: mergedExternal.title || perplexityData?.title || title,
        imageSources: Array.isArray(req.body.imageSources)
            ? req.body.imageSources
            : (Array.isArray(req.body.sources) ? req.body.sources : []),
        sources,
        coverUrls: mergedExternal.coverUrls.length > 0 ? mergedExternal.coverUrls : null,
        pageCount: mergedExternal.pageCount || perplexityData?.pageCount || null,
        coverImage: mergedExternal.coverUrls.length > 0 ? (mergedExternal.coverUrls[0] || null) : null,
        isbn: firstNonEmpty(mergedExternal.isbn, perplexityData?.isbn),
        publisher: firstNonEmpty(mergedExternal.publisher, perplexityData?.publisher),
        publicationDate: firstNonEmpty(mergedExternal.publicationDate, perplexityData?.publicationDate),
        publishedDate: firstNonEmpty(mergedExternal.publicationDate, perplexityData?.publicationDate),
        description: firstNonEmpty(mergedExternal.description, perplexityData?.description),
    };

    // Merging Authors
    const pAuthors = perplexityData?.authors || (perplexityData?.author ? [perplexityData.author] : []);
    const gAuthors = mergedExternal.authors;
    
    // Perplexity might return authors even if it found nothing else?
    // The prompt says: "If any Google Books/OpenLibrary field is empty, retain the value from Perplexity"
    // And "The resulting Authors column is a union..."
    
    const geminiAuthor = author ? [author] : [];
    
    // If externalData (Google) exists, use its authors + perplexity authors
    // If not, use perplexity authors + gemini?
    // Actually, Perplexity overrides Gemini. Google overrides Perplexity.
    
    let combinedAuthors = [];
    if (gAuthors.length > 0) {
        combinedAuthors = await mergeAuthorsFuzzy(gAuthors, pAuthors);
    } else if (perplexityData) {
        combinedAuthors = await mergeAuthorsFuzzy(pAuthors, []);
    } else {
        combinedAuthors = geminiAuthor;
    }

    finalData.authors = combinedAuthors;
    finalData.coverImages = finalData.coverUrls || [];
    
    res.status(200).json(finalData);
}
