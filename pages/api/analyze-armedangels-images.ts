import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface ImageInfo {
  filename: string;
  reference: string;
  color: string;
  variant: number;
  baseName: string;
}

interface ImageGroup {
  reference: string;
  color: string;
  count: number;
  images: string[];
}

interface AnalysisResult {
  success: boolean;
  totalImages: number;
  uniqueProducts: number;
  groups: ImageGroup[];
  csv: string;
  error?: string;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalysisResult>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      totalImages: 0,
      uniqueProducts: 0,
      groups: [],
      csv: '',
      error: 'Method not allowed',
    });
  }

  try {
    // Path to the WOMEN folder
    const imageFolderPath = path.join(process.env.HOME || '/Users/bajoris', 'Downloads', 'WOMEN');

    // Check if folder exists
    if (!fs.existsSync(imageFolderPath)) {
      return res.status(400).json({
        success: false,
        totalImages: 0,
        uniqueProducts: 0,
        groups: [],
        csv: '',
        error: `Folder not found: ${imageFolderPath}`,
      });
    }

    // Read all JPG files
    const files = fs.readdirSync(imageFolderPath)
      .filter(file => file.toLowerCase().endsWith('.jpg'))
      .sort();

    console.log(`📸 Found ${files.length} JPG files in ${imageFolderPath}`);

    // Parse image filenames and group by reference + color
    const imageMap = new Map<string, ImageGroup>();
    const parsedImages: ImageInfo[] = [];

    files.forEach((filename) => {
      // Parse filename: "30005160-3232 (1).jpg" → reference=30005160, color=3232, variant=1
      // Or: "30005160-3232.jpg" → reference=30005160, color=3232, variant=0
      
      const match = filename.match(/^(\d+)-(\d+)(?:\s*\((\d+)\))?\.jpg$/i);
      if (!match) {
        console.log(`⚠️ Skipped unmatched filename: ${filename}`);
        return;
      }

      const reference = match[1];
      const color = match[2];
      const variant = match[3] ? parseInt(match[3]) : 0;
      const key = `${reference}-${color}`;

      parsedImages.push({
        filename,
        reference,
        color,
        variant,
        baseName: `${reference}-${color}`,
      });

      // Group by reference-color combination
      if (!imageMap.has(key)) {
        imageMap.set(key, {
          reference,
          color,
          count: 0,
          images: [],
        });
      }

      const group = imageMap.get(key)!;
      group.count++;
      group.images.push(filename);
    });

    // Convert map to array and sort
    const groups = Array.from(imageMap.values())
      .sort((a, b) => {
        const refCompare = a.reference.localeCompare(b.reference);
        if (refCompare !== 0) return refCompare;
        return a.color.localeCompare(b.color);
      });

    console.log(`✅ Organized ${files.length} images into ${groups.length} product-color combinations`);

    // Generate CSV
    const csvHeader = 'Item Number,Color Code,Image Count,Image Files,Local Path';
    const csvRows = groups.map(group => {
      const imageFiles = group.images.join(' | ');
      const localPath = `~/Downloads/WOMEN/`;
      return `${group.reference},"${group.color}",${group.count},"${imageFiles}","${localPath}"`;
    });
    const csv = [csvHeader, ...csvRows].join('\n');

    return res.status(200).json({
      success: true,
      totalImages: files.length,
      uniqueProducts: groups.length,
      groups,
      csv,
    });
  } catch (error) {
    console.error('❌ Error analyzing images:', error);
    return res.status(500).json({
      success: false,
      totalImages: 0,
      uniqueProducts: 0,
      groups: [],
      csv: '',
      error: `Failed to analyze images: ${(error as Error).message}`,
    });
  }
}
