
import { IncomingForm } from 'formidable';
import fs from 'fs';
import crypto from 'crypto';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL, getMetadata } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Shared Logic (can be refactored into a util)
async function getFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return { hash: hashSum.digest('hex'), buffer: fileBuffer };
}

async function uploadImageToFirebase(buffer, hash, mimeType) {
    const storagePath = `images/${hash}`;
    const storageRef = ref(storage, storagePath);

    try {
        await getMetadata(storageRef);
        const downloadURL = await getDownloadURL(storageRef);
        return { downloadURL, exists: true };
    } catch (error) {
        if (error.code === 'storage/object-not-found') {
            await uploadBytes(storageRef, buffer, { contentType: mimeType });
            const downloadURL = await getDownloadURL(storageRef);
            return { downloadURL, exists: false };
        }
        throw error;
    }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const form = new IncomingForm();
  
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      return res.status(500).json({ message: 'Error parsing form data' });
    }

    // Support single file upload for now, key 'file'
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      const { hash, buffer } = await getFileHash(file.filepath);
      const { downloadURL, exists } = await uploadImageToFirebase(buffer, hash, file.mimetype);

      // Create a "raw_upload" record or similar? 
      // The user prompt implies just uploading logic. 
      // Optionally we can create a book entry if fields are present.
      
      // If fields are provided (title, location, etc.), we can create a book entry
      // For now, let's return the URL and Hash so the frontend can do next steps or just confirm.

      return res.status(200).json({ 
        message: 'Upload successful', 
        url: downloadURL, 
        hash: hash,
        exists: exists 
      });

    } catch (uploadError) {
      console.error('Upload processing error:', uploadError);
      return res.status(500).json({ message: 'Error processing upload', error: uploadError.message });
    }
  });
}
