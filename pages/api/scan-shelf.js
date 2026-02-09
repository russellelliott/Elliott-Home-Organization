import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from 'sharp';
import heicConvert from 'heic-convert';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Images can be large
    },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { folder, targetFiles } = req.body;
  if (!folder) {
    return res.status(400).json({ message: 'Folder name is required' });
  }

  try {
    // Resolve path relative to the project root (bookshelf-scanner)
    // Assuming 'Library Images' is a sibling folder to 'bookshelf-scanner'
    const baseDir = path.resolve(process.cwd(), '../Library Images');
    const targetDir = path.join(baseDir, folder);

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const files = fs.readdirSync(targetDir);
    let imageFiles = files.filter(file => 
      ['.heic', '.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())
    );

    if (targetFiles && Array.isArray(targetFiles) && targetFiles.length > 0) {
      const targetSet = new Set(targetFiles);
      imageFiles = imageFiles.filter(f => targetSet.has(f));
    }

    if (imageFiles.length === 0) {
      return res.status(404).json({ message: 'No images found in folder or no matching target files' });
    }

    const parts = [];
    
    // Prompt structure
    parts.push({ text: "Please look at these images of a bookshelf. I will provide the image filename before each image part. Extract a list of all the visible books. Return a strictly valid JSON list of objects. Each object must have 'title', 'author', and 'sources' keys. 'sources' must be an array of strings listing the filename(s) of the image(s) where this specific book was detected. Combine duplicates: if a book is found in multiple images, create one object for it and list all corresponding image filenames in 'sources'. Pay close attention to author names: if a cover shows multiple names separated by hyphens, dots, or line breaks (e.g., 'Allen - Gibson'), interpret them as distinct authors (e.g., 'Allen, Gibson') rather than a single compound name. Do not return markdown formatting, just the raw JSON." });

    for (const file of imageFiles) {
      const filePath = path.join(targetDir, file);
      let fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(file).toLowerCase();

      // Convert HEIC to JPEG buffer first because Sharp's HEIC support can be tricky on some systems
      if (ext === '.heic') {
        try {
          fileBuffer = await heicConvert({
            buffer: fileBuffer,
            format: 'JPEG',
            quality: 1 // High quality just for intermediary, 1 = 100%? No 0-1 usually. Docs say 0 to 1. 
          });
        } catch (err) {
            console.error(`Error converting HEIC ${file}:`, err);
            continue; // Skip this file if conversion fails
        }
      }

      // Resize and Compress with Sharp
      try {
        const optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 1024, withoutEnlargement: true }) // Downscale to width 1024px, maintain aspect ratio
          .jpeg({ quality: 80 }) // Compress as JPEG quality 80
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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    const cleanText = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    
    let books = [];
    try {
        books = JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse JSON", cleanText);
        return res.status(500).json({ message: "Failed to parse Gemini response", raw: text });
    }

    res.status(200).json({ books });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
