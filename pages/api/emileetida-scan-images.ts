import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface ImageMatch {
  filename: string;
  filepath: string;
  matchedReferences: string[]; // Product references found in filename (e.g., AD019, AD009)
  imageNumber: number; // For sorting (1, 2, 3... based on filename)
}

interface ProductImages {
  productReference: string;
  images: ImageMatch[];
}

interface ScanResponse {
  success: boolean;
  totalImages?: number;
  matchedProducts?: number;
  productImages?: ProductImages[];
  unmatchedImages?: ImageMatch[];
  error?: string;
}

// Extract product references from Emile et Ida filename
// Format: "EMILE IDA E26 AD019 AD009 ADBOBFRAISE ADBOBCERISE (1).jpg"
// Product references start with "AD" followed by numbers and optionally letters
function extractReferences(filename: string): string[] {
  // Remove extension and image number suffix like (1), (2), etc.
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '');
  
  // Split by spaces and find all parts that look like product references
  const parts = baseName.split(/\s+/);
  const references: string[] = [];
  
  for (const part of parts) {
    // Match AD followed by numbers, optionally followed by letters
    // Examples: AD019, AD009, AD207B, AD101A, ADBOBFRAISE, ADBOBCERISE
    const upperPart = part.toUpperCase();
    if (/^AD\d+[A-Z]?$/i.test(upperPart)) {
      // Standard reference like AD019, AD207B
      references.push(upperPart);
    } else if (/^AD[A-Z]+$/i.test(upperPart)) {
      // Named reference like ADBOBFRAISE, ADBOBCERISE, ADMISTIGRI
      references.push(upperPart);
    }
  }
  
  return references;
}

// Extract image number from filename (1), (2), etc.
function extractImageNumber(filename: string): number {
  const match = filename.match(/\((\d+)\)/);
  return match ? parseInt(match[1]) : 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScanResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { imageFolderPath, productReferences } = req.body as {
      imageFolderPath: string;
      productReferences: string[]; // List of product references to match (e.g., ['AD216', 'AD207B'])
    };

    if (!imageFolderPath) {
      return res.status(400).json({ success: false, error: 'Missing imageFolderPath' });
    }

    // Expand tilde to home directory
    let expandedPath = imageFolderPath;
    if (expandedPath.startsWith('~')) {
      expandedPath = path.join(process.env.HOME || '', expandedPath.slice(1));
    }

    // Check if directory exists
    if (!fs.existsSync(expandedPath)) {
      return res.status(400).json({ 
        success: false, 
        error: `Directory not found: ${expandedPath}` 
      });
    }

    console.log(`🌸 Scanning Emile et Ida images from: ${expandedPath}`);

    // Read all image files from the directory
    const entries = fs.readdirSync(expandedPath);
    const imageFiles = entries.filter(entry => {
      const ext = path.extname(entry).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });

    console.log(`📸 Found ${imageFiles.length} image files`);

    // Parse each image file to extract references
    const allImages: ImageMatch[] = imageFiles.map(filename => ({
      filename,
      filepath: path.join(expandedPath, filename),
      matchedReferences: extractReferences(filename),
      imageNumber: extractImageNumber(filename),
    }));

    // Normalize product references for matching (uppercase)
    const normalizedProductRefs = new Set(
      (productReferences || []).map(ref => ref.toUpperCase())
    );

    // Group images by product reference
    const productImagesMap: Map<string, ImageMatch[]> = new Map();
    const unmatchedImages: ImageMatch[] = [];

    for (const image of allImages) {
      let matched = false;
      
      for (const ref of image.matchedReferences) {
        // Check if this reference matches any of our products
        // Match by prefix (e.g., AD207 matches AD207B)
        const matchingProduct = [...normalizedProductRefs].find(productRef => {
          const upperRef = ref.toUpperCase();
          const upperProductRef = productRef.toUpperCase();
          // Exact match or prefix match (AD207 matches AD207B or AD207D)
          return upperProductRef === upperRef || 
                 upperProductRef.startsWith(upperRef) ||
                 upperRef.startsWith(upperProductRef);
        });

        if (matchingProduct) {
          matched = true;
          if (!productImagesMap.has(matchingProduct)) {
            productImagesMap.set(matchingProduct, []);
          }
          // Add image if not already added for this product
          const existingImages = productImagesMap.get(matchingProduct)!;
          if (!existingImages.some(img => img.filename === image.filename)) {
            existingImages.push(image);
          }
        }
      }

      if (!matched && image.matchedReferences.length > 0) {
        unmatchedImages.push(image);
      }
    }

    // Convert map to array and sort images within each product
    const productImages: ProductImages[] = [];
    for (const [productRef, images] of productImagesMap) {
      // Sort by image number (images without number come first, then by number)
      const sortedImages = [...images].sort((a, b) => {
        if (a.imageNumber === 0 && b.imageNumber === 0) {
          return a.filename.localeCompare(b.filename);
        }
        if (a.imageNumber === 0) return -1;
        if (b.imageNumber === 0) return 1;
        return a.imageNumber - b.imageNumber;
      });

      productImages.push({
        productReference: productRef,
        images: sortedImages,
      });
    }

    console.log(`✅ Matched ${productImages.length} products with images`);
    console.log(`⚠️ ${unmatchedImages.length} images not matched to any product`);

    return res.status(200).json({
      success: true,
      totalImages: imageFiles.length,
      matchedProducts: productImages.length,
      productImages,
      unmatchedImages,
    });

  } catch (error) {
    console.error('❌ Error scanning Emile et Ida images:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to scan images',
    });
  }
}
