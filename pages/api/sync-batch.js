
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL, getMetadata } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';

export const config = {
    api: {
        responseLimit: false,
    },
};

// --- Shared Logic Start ---
// Ideally this should be in a lib file, but duplicating for safety in this context
async function getFileHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return { hash: hashSum.digest('hex'), buffer: fileBuffer };
}

async function uploadImageToFirebase(buffer, hash) {
    const storagePath = `images/${hash}`;
    const storageRef = ref(storage, storagePath);

    try {
        await getMetadata(storageRef);
        const downloadURL = await getDownloadURL(storageRef);
        return { downloadURL, exists: true };
    } catch (error) {
        if (error.code === 'storage/object-not-found') {
            await uploadBytes(storageRef, buffer, { contentType: 'image/jpeg' }); // Or infer content type
            const downloadURL = await getDownloadURL(storageRef);
            return { downloadURL, exists: false };
        }
        throw error;
    }
}

async function getOrCreateLocationId(locationName, photoUrl) {
    const locationsRef = collection(db, 'locations');
    const q = query(locationsRef, where('name', '==', locationName));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();
        const docRef = docSnap.ref;
        // Add photoUrl if not present
        if (!data.photoUrls || !data.photoUrls.includes(photoUrl)) {
             const newPhotoUrls = data.photoUrls ? [...data.photoUrls, photoUrl] : [photoUrl];
             await updateDoc(docRef, { photoUrls: newPhotoUrls });
        }
        return docSnap.id;
    } else {
        const docRef = await addDoc(locationsRef, {
            name: locationName,
            photoUrls: [photoUrl]
        });
        return docRef.id;
    }
}
// --- Shared Logic End ---

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { books, folder } = req.body;

    if (!books || !Array.isArray(books)) {
        return res.status(400).json({ message: 'Invalid data format' });
    }

    // Resolve path relative to the project root (bookshelf-scanner)
    // Assuming 'Library Images' is a sibling folder to 'bookshelf-scanner'
    const baseDir = path.resolve(process.cwd(), '../Library Images');
    
    // Cache for location IDs to avoid redundant Firestore lookups
    const locationCache = new Map();
    const results = {
        total: books.length,
        synced: 0,
        failed: 0,
        errors: []
    };

    try {
        for (const book of books) {
            // Construct absolute path
            // book.location usually matches the folder name
            // book.imageSource is filename
            const imagePath = path.join(baseDir, book.location, book.imageSource);

            const fileData = await getFileHash(imagePath);
            if (!fileData) {
                results.failed++;
                results.errors.push(`Image not found: ${book.title} (${imagePath})`);
                continue;
            }

            const { hash, buffer } = fileData;
            
            try {
                const { downloadURL, exists } = await uploadImageToFirebase(buffer, hash);
                
                // Get Location ID
                let locationId = locationCache.get(book.location);
                if (!locationId) {
                    locationId = await getOrCreateLocationId(book.location, downloadURL);
                    locationCache.set(book.location, locationId);
                }

                // Create Book Document
                await addDoc(collection(db, 'books'), {
                    ...book,
                    imagePath: downloadURL,
                    fileHash: hash,
                    locationId: locationId,
                    dateAdded: new Date().toISOString(),
                    syncedAt: new Date().toISOString()
                });

                results.synced++;

            } catch (err) {
                console.error("Error processing book:", book.title, err);
                results.failed++;
                results.errors.push(`Error syncing ${book.title}: ${err.message}`);
            }
        }

        return res.status(200).json({ message: 'Batch sync complete', results });

    } catch (error) {
        console.error("Batch sync fatal error:", error);
        return res.status(500).json({ message: 'Server error during sync', error: error.message });
    }
}
