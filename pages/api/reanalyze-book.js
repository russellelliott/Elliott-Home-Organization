
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from 'sharp';
import heicConvert from 'heic-convert';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { folder, sources, currentTitle, currentAuthor, feedbackType, feedbackDetails } = req.body;

  if (!folder || !sources || sources.length === 0) {
    return res.status(400).json({ message: 'Folder and image sources are required' });
  }

  try {
    const baseDir = "/Users/russellelliott/Desktop/Elliott Home Organization/Library Images";
    const targetDir = path.join(baseDir, folder);

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const parts = [];
    
    // Construct Prompt
    let promptText = `I previously identified a book as "${currentTitle}" by "${currentAuthor}".\n`;
    promptText += `The user has indicated this is incorrect.\n`;
    
    if (feedbackType === 'title_wrong') {
        promptText += `The user specifically says the TITLE is wrong. Please re-examine the image to correct the title.\n`;
    } else if (feedbackType === 'author_wrong') {
        promptText += `The user specifically says the AUTHOR is wrong. Please re-examine the image to correct the author.\n`;
    } else if (feedbackType === 'both_wrong') {
        promptText += `The user says BOTH the title and author are wrong.\n`;
    }

    if (feedbackDetails) {
        promptText += `Additional User Feedback/Hint: "${feedbackDetails}"\n`;
    }

    promptText += `\nPlease look at the provided image(s) again focusing ONLY on the book that looks like the one described above. Return a JSON object with two keys: "title" and "author". Do not return a list. Just the single best guess for this specific book. No markdown, just raw JSON.`;

    parts.push({ text: promptText });

    // Load only the relevant images
    const uniqueSources = Array.isArray(sources) ? sources : [sources];
    
    for (const file of uniqueSources) {
      const filePath = path.join(targetDir, file);
      if (!fs.existsSync(filePath)) {
          console.warn(`File not found: ${filePath}`);
          continue;
      }

      let fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(file).toLowerCase();

      // Convert HEIC
      if (ext === '.heic') {
        try {
          fileBuffer = await heicConvert({
            buffer: fileBuffer,
            format: 'JPEG',
            quality: 1 
          });
        } catch (err) {
            console.error(`Error converting HEIC ${file}:`, err);
            continue; 
        }
      }

      // Optimize
      try {
        const optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 1024, withoutEnlargement: true }) 
          .jpeg({ quality: 80 }) 
          .toBuffer();

        parts.push({ text: `Image Filename: ${file}` });
        parts.push({
            inlineData: {
            mimeType: 'image/jpeg',
            data: optimizedBuffer.toString('base64')
            }
        });
      } catch (err) {
         console.error(`Error processing image ${file}:`, err);
      }
    }

    if (parts.length <= 1) {
         return res.status(500).json({ message: 'Failed to prepare images for re-analysis' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();
    const cleanText = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    
    let correctedBook = {};
    try {
        // Sometimes the model might return a list even if asked for an object, simplify handling
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed)) {
            correctedBook = parsed[0];
        } else {
            correctedBook = parsed;
        }
    } catch (e) {
        console.error("Failed to parse JSON", cleanText);
        return res.status(500).json({ message: 'Failed to parse AI response', raw: cleanText });
    }

    return res.status(200).json({ 
        originalTitle: currentTitle,
        correctedBook
    });

  } catch (error) {
    console.error("Re-analysis Error:", error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
