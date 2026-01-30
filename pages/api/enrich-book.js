import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { title, author } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Book title is required' });
  }

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
      - Publication year or date

      Return ONLY a valid JSON object with these exact keys: "authors", "isbn", "publisher", "publicationDate".
      Do not include any other text or markdown formatting.
    `;

    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await perplexity.chat.completions.create({
          model: "sonar-pro",
          messages: [
            { role: "system", content: "You are a helpful bibliophile assistant who outputs only strict JSON." },
            { role: "user", content: prompt },
          ],
        });

        const content = response.choices[0].message.content;
        
        // More robust JSON extraction
        let jsonStr = content;
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        
        if (start !== -1 && end !== -1) {
          jsonStr = content.substring(start, end + 1);
        }

        const details = JSON.parse(jsonStr);
        return res.status(200).json(details);
      } catch (e) {
        console.error(`Attempt ${attempts} failed:`, e.message);
        lastError = e;
        if (attempts === maxAttempts) break;
        // Wait a short delay before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.error("Failed to fetch/parse Perplexity JSON after retries");
    return res.status(200).json({ error: "Failed to fetch details", details: lastError?.message });

  } catch (error) {
    console.error("Perplexity API Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
