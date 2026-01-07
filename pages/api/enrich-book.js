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
      
      Details required:
      - Author(s)
      - ISBN (prefer 13-digit, otherwise 10-digit)
      - Publisher
      - Publication year or date
      - Edition (e.g., first, revised) if visible (or generally known primary edition)

      Return ONLY a valid JSON object with these exact keys: "authors", "isbn", "publisher", "publicationDate", "edition".
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
    const cleanContent = content.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

    let details = {};
    try {
        details = JSON.parse(cleanContent);
    } catch (e) {
        console.error("Failed to parse Perplexity JSON", content);
        details = { error: "Failed to parse details", raw: content };
    }

    res.status(200).json(details);

  } catch (error) {
    console.error("Perplexity API Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
