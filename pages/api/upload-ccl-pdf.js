import { db, storage } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { season, year } = req.body;

  if (!season || !year) {
    return res.status(400).json({ message: 'Season and year are required' });
  }

  try {
    const tournamentsRef = collection(db, "ccl-tournament-info");
    const q = query(tournamentsRef, where("season", "==", season), where("year", "==", year));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(404).json({ message: `No tournament info found for ${season} ${year}.` });
    }

    const updatedDocs = [];

    for (const document of querySnapshot.docs) {
      const data = document.data();
      
      // If PDF link exists and we haven't uploaded it yet (or want to re-upload)
      if (data.pdf && !data.pdfStorageUrl) {
        try {
          const pdfLink = data.pdf;
          const driveIdMatch = pdfLink.match(/\/d\/(.+?)\//);
          
          if (driveIdMatch && driveIdMatch[1]) {
            const fileId = driveIdMatch[1];
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            const pdfResponse = await fetch(downloadUrl);
            if (pdfResponse.ok) {
                const pdfArrayBuffer = await pdfResponse.arrayBuffer();
                const pdfUint8Array = new Uint8Array(pdfArrayBuffer);

                const fileName = `ccl/${season}/${year}/${Date.now()}_ccl_${season}_${year}.pdf`;
                const storageRef = ref(storage, fileName);
                
                // Upload
                await uploadBytes(storageRef, pdfUint8Array, { contentType: 'application/pdf' });
                const pdfStorageUrl = await getDownloadURL(storageRef);

                // Update Firestore document
                const docRef = doc(db, "ccl-tournament-info", document.id);
                await updateDoc(docRef, { pdfStorageUrl: pdfStorageUrl });

                updatedDocs.push({ id: document.id, pdfStorageUrl });
            } else {
                console.error(`Failed to download PDF from ${downloadUrl}`);
            }
          }
        } catch (e) {
          console.error("Error processing PDF:", e);
        }
      } else if (data.pdfStorageUrl) {
          updatedDocs.push({ id: document.id, pdfStorageUrl: data.pdfStorageUrl, message: 'Already exists', exists: true });
      }
    }

    return res.status(200).json({
      message: 'PDF processing completed',
      updatedDocs
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
