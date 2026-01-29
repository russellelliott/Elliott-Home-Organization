import fs from 'fs';
import path from 'path';
import ExifReader from 'exifreader';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { folder } = req.body;
  if (!folder) {
    return res.status(400).json({ message: 'Folder name is required' });
  }

  try {
    const baseDir = "/Users/russellelliott/Desktop/Elliott Home Organization/Library Images";
    const targetDir = path.join(baseDir, folder);

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const files = fs.readdirSync(targetDir);
    const imageFiles = files.filter(file => 
      ['.heic', '.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())
    );

    if (imageFiles.length === 0) {
      return res.status(404).json({ message: 'No images found in folder' });
    }

    const results = [];

    for (const file of imageFiles) {
      const filePath = path.join(targetDir, file);
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const tags = await ExifReader.load(fileBuffer);
        
        let latitude = tags.GPSLatitude?.description || null;
        let longitude = tags.GPSLongitude?.description || null;
        const gpsAltitude = tags.GPSAltitude?.description || null;
        const gpsDateStamp = tags.GPSDateStamp?.description || null;
        const gpsTimeStamp = tags.GPSTimeStamp?.description || null;

        if (latitude && longitude) {
            // Convert to numbers
            latitude = parseFloat(latitude);
            longitude = parseFloat(longitude);

            // Apply direction reference (N/S, E/W)
            const latRef = tags.GPSLatitudeRef?.description || tags.GPSLatitudeRef?.value?.[0];
            const lonRef = tags.GPSLongitudeRef?.description || tags.GPSLongitudeRef?.value?.[0];

            if (latRef && (latRef === 'S' || latRef.startsWith('S'))) {
                latitude = -1 * Math.abs(latitude);
            }

            if (lonRef && (lonRef === 'W' || lonRef.startsWith('W'))) {
                longitude = -1 * Math.abs(longitude);
            }

            results.push({
                fileName: file,
                latitude, // Now a number with correct sign
                longitude, // Now a number with correct sign
                altitude: gpsAltitude,
                dateStamp: gpsDateStamp,
                timeStamp: gpsTimeStamp,
            });
        }
      } catch (err) {
        console.error(`Error reading EXIF for ${file}:`, err);
        // Continue to next file
      }
    }

    return res.status(200).json({
      folder,
      imageCount: imageFiles.length,
      gpsData: results,
    });

  } catch (error) {
    console.error('Error extracting GPS data:', error);
    return res.status(500).json({ 
      message: 'Failed to extract GPS data',
      error: error.message,
    });
  }
}
