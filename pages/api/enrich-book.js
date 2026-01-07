import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { title, author } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Book title is required' });
  }

  try {
    const prompt = `
      Provide the following details for the book "${title}" by "${author || 'Unknown'}":
      
      - Author(s)
      - ISBN (10 or 13-digit)
      - Publisher
      - Publication year or date
      - Edition (e.g., first, revised) if visible (or generally known primary edition)

      Return ONLY a valid JSON object with these exact keys: "authors", "isbn", "publisher", "publicationDate", "edition".
      Do not include any other text or markdown formatting.
    `;

    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [
        { role: 'system', content: 'You are a helpful bibliophile assistant who outputs only strict JSON.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0].message.content;
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let details = {};
    try {
        details = JSON.parse(cleanContent);
    } catch (e) {
        // Fallback or partial
        console.error("Failed to parse Perplexity JSON", content);
        details = { error: "Failed to parse details", raw: content };
    }

    res.status(200).json(details);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
