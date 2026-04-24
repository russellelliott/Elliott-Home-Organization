
import axios from 'axios';
import heicConvert from 'heic-convert';

const imageCache = new Map();
const MAX_CACHE_ENTRIES = 500;

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing URL');
  }

  if (imageCache.has(url)) {
    const cached = imageCache.get(url);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Image-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });

    const contentType = response.headers['content-type'] || '';
    let buffer = Buffer.from(response.data);
    let finalContentType = contentType;

    // Robust HEIC detection by checking magic bytes (ftyp box)
    // HEIC files start with 00 00 00 XX 66 74 79 70 (ftyp)
    // followed by brands like 'heic', 'heix', 'mif1', 'msf1'
    let isHeic = 
      contentType.toLowerCase().includes('heic') || 
      contentType.toLowerCase().includes('heif') ||
      url.toLowerCase().includes('.heic');

    if (!isHeic && buffer.length > 12) {
      // Check for ftyp at offset 4
      if (buffer.toString('ascii', 4, 8) === 'ftyp') {
        const brand = buffer.toString('ascii', 8, 12).toLowerCase();
        if (['heic', 'heix', 'heim', 'msf1', 'mif1'].includes(brand)) {
          isHeic = true;
        }
      }
    }

    if (isHeic) {
      try {
        const jpegBuffer = await heicConvert({
          buffer,
          format: 'JPEG',
          quality: 0.8
        });
        buffer = Buffer.from(jpegBuffer);
        finalContentType = 'image/jpeg';
      } catch (error) {
        console.error('HEIC conversion failed:', error);
      }
    }

    if (imageCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = imageCache.keys().next().value;
      imageCache.delete(oldestKey);
    }

    imageCache.set(url, {
      buffer,
      contentType: finalContentType,
    });

    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Image-Cache', 'MISS');
    return res.send(buffer);

  } catch (error) {
    console.error('Image proxy error:', error.message);
    return res.status(500).send('Error fetching image');
  }
}
