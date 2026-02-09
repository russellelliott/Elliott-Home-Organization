import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { folder, file } = req.query;
  if (!folder || !file) return res.status(400).send('Missing folder or file');

  // Verify folder/file to prevent traversal? simple check
  if (folder.includes('..') || file.includes('..')) {
      return res.status(400).send('Invalid path');
  }

  try {
      const filePath = path.resolve(process.cwd(), '../Library Images', folder, file);
      
      if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      if (ext === '.webp') contentType = 'image/webp';
      
      const img = fs.readFileSync(filePath);
      res.setHeader('Content-Type', contentType);
      res.send(img);
  } catch (e) {
      console.error(e);
      res.status(500).send('Error serving image');
  }
}
