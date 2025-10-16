import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'object', method: 'execute_kw', args: executeArgs },
    id: Date.now(),
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

interface FetchPlayUpImagesRequest {
  productDescription: string;
  colorCode: string;
  colorName?: string;
  templateId: number;
  playupUsername: string;
  playupPassword: string;
  odooUid: string;
  odooPassword: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('🎮 [Play UP Images] API called');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      productDescription, 
      colorCode,
      colorName,
      templateId, 
      playupUsername, 
      playupPassword,
      odooUid, 
      odooPassword 
    } = req.body as FetchPlayUpImagesRequest;

    if (!productDescription || !templateId || !playupUsername || !playupPassword || !odooUid || !odooPassword) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log(`🖼️ Fetching images for: ${productDescription} (color: ${colorCode}/${colorName || 'unknown'})`);

    // Step 1: Login to Play UP
    console.log('Step 1: Logging in to Play UP...');
    const homeResponse = await fetch('https://pro.playupstore.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    const homeCookies = homeResponse.headers.get('set-cookie');
    const sessionCookie = homeCookies?.match(/PHPSESSID=[^;]+/)?.[0] || '';
    
    const loginResponse = await fetch('https://pro.playupstore.com/checkout/b2b/dologin.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': sessionCookie,
        'Referer': 'https://pro.playupstore.com/',
      },
      body: new URLSearchParams({
        csrf: '',
        b2b: '1',
        email: playupUsername,
        password: playupPassword,
      }).toString(),
      redirect: 'manual',
    });
    
    if (loginResponse.status !== 302) {
      return res.status(401).json({ 
        success: false, 
        error: 'Play UP login failed' 
      });
    }
    
    const loginCookies = loginResponse.headers.get('set-cookie');
    const allCookies = [sessionCookie, ...(loginCookies || '').split(',').map(c => c.split(';')[0].trim())].filter(c => c).join('; ');
    console.log('✅ Login successful');

    // Step 2: Search for product by description
    console.log(`Step 2: Searching for product: ${productDescription}`);
    const searchUrl = `https://pro.playupstore.com/en/search-page_36.html?c=1&term=${encodeURIComponent(productDescription)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': allCookies,
      },
    });

    if (!searchResponse.ok) {
      return res.status(500).json({ 
        success: false, 
        error: 'Search failed' 
      });
    }

    const searchHtml = await searchResponse.text();
    console.log(`Search page size: ${searchHtml.length} chars`);

    // Step 3: Extract product URL from search results
    // Look for product link: <a href="https://pro.playupstore.com/en/baby-girl/flame-rib-t-shirt_p74320.html"
    const productLinkMatch = searchHtml.match(/<a href="(https:\/\/pro\.playupstore\.com\/[^"]+_p\d+\.html[^"]*?)"/);
    
    if (!productLinkMatch) {
      console.log('❌ No product link found in search results');
      return res.status(404).json({
        success: false,
        error: 'Product not found in search results',
      });
    }

    const productUrl = productLinkMatch[1].replace(/&amp;/g, '&');
    console.log(`✅ Found product URL: ${productUrl}`);

    // Step 4: Fetch product page
    console.log('Step 3: Fetching product page...');
    const productResponse = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': allCookies,
      },
    });

    const productHtml = await productResponse.text();
    console.log(`Product page size: ${productHtml.length} chars`);

    // Step 5: Extract images for the specific color
    // Look for image URLs in the HTML and deduplicate by hash
    const imageMatches = [...productHtml.matchAll(/https:\/\/pro\.playupstore\.com\/temp\/(\d+)_([a-f0-9]+)\.jpg/g)];
    
    // Group by hash to remove duplicates (same image, different sizes)
    const uniqueImagesByHash = new Map<string, string>();
    imageMatches.forEach(match => {
      const fullUrl = match[0];
      const hash = match[2];
      
      if (!uniqueImagesByHash.has(hash)) {
        uniqueImagesByHash.set(hash, fullUrl);
      }
    });
    
    const uniqueImages = Array.from(uniqueImagesByHash.values());
    
    console.log(`Found ${imageMatches.length} total image references`);
    console.log(`Filtered to ${uniqueImages.length} unique images`);
    
    // Take up to 3 images
    const productImages = uniqueImages.slice(0, 3);
    
    if (productImages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No images found on product page',
      });
    }

    console.log(`📸 Using ${productImages.length} images:`, productImages);

    // Step 6: Download images and convert to base64
    console.log(`📥 Downloading ${productImages.length} images...`);
    const imageData: Array<{ url: string; base64: string }> = [];
    
    for (let i = 0; i < productImages.length; i++) {
      const imageUrl = productImages[i];
      try {
        console.log(`📥 [${i + 1}/${productImages.length}] Downloading: ${imageUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const imageResponse = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!imageResponse.ok) {
          throw new Error(`HTTP ${imageResponse.status}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        
        imageData.push({
          url: imageUrl,
          base64: base64,
        });
        
        console.log(`✅ [${i + 1}/${productImages.length}] Downloaded ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (imgError) {
        console.error(`❌ [${i + 1}/${productImages.length}] Failed:`, imgError);
      }
    }

    if (imageData.length === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to download any images' 
      });
    }

    // Step 7: Upload images to Odoo
    console.log(`☁️ Uploading ${imageData.length} images to Odoo...`);
    const uploadResults = [];
    
    for (let i = 0; i < imageData.length; i++) {
      const img = imageData[i];
      
      try {
        console.log(`☁️ [${i + 1}/${imageData.length}] Uploading to Odoo...`);
        
        const imageId = await callOdoo(
          parseInt(odooUid),
          odooPassword,
          'product.image',
          'create',
          [{
            name: `${colorName || colorCode} - Image ${i + 1}`,
            product_tmpl_id: templateId,
            image_1920: img.base64,
            sequence: i + 1,
          }]
        );
        
        uploadResults.push({
          success: true,
          imageId,
          sequence: i + 1,
          url: img.url,
        });
        
        console.log(`✅ [${i + 1}/${imageData.length}] Uploaded! Image ID: ${imageId}`);
      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${imageData.length}] Upload failed:`, uploadError);
        uploadResults.push({
          success: false,
          error: String(uploadError),
          sequence: i + 1,
          url: img.url,
        });
      }
    }

    const successCount = uploadResults.filter(r => r.success).length;
    console.log(`🎉 Complete: ${successCount}/${imageData.length} images uploaded`);

    return res.status(200).json({
      success: true,
      imagesFound: productImages.length,
      imagesDownloaded: imageData.length,
      imagesUploaded: successCount,
      results: uploadResults,
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch images',
    });
  }
}

