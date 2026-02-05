
import axios from 'axios';
import heicConvert from 'heic-convert';

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

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });

    const contentType = response.headers['content-type'] || '';
    const buffer = Buffer.from(response.data);

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
        res.setHeader('Content-Type', 'image/jpeg');
        // Cache for a long time since these are immutable hashes mostly
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(jpegBuffer);
      } catch (error) {
        console.error('HEIC conversion failed:', error);
        // If conversion fails, default to passing through
      }
    }

    // Pass through original if not HEIC or conversion failed
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);

  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(500).send('Error fetching image');
  }
}
