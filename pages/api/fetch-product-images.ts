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

interface FetchImagesRequest {
  productName: string;
  productReference: string;
  vendorUrl: string;
  templateId: number;
  uid: string;
  password: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('🚀 [API CALLED] fetch-product-images endpoint hit');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📦 [REQUEST BODY] Received:', { productName: req.body?.productName, productReference: req.body?.productReference, vendorUrl: req.body?.vendorUrl, templateId: req.body?.templateId });
    const { productName, productReference, vendorUrl, templateId, uid, password } = req.body as FetchImagesRequest;

    if (!productName || !vendorUrl || !templateId || !uid || !password) {
      console.log('❌ [ERROR] Missing parameters:', { productName: !!productName, productReference: !!productReference, vendorUrl: !!vendorUrl, templateId: !!templateId, uid: !!uid, password: !!password });
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log(`🖼️ [START] Fetching images for: ${productName} (ref: ${productReference}) from ${vendorUrl}`);

    let productImages: string[] = [];
    let matchedProduct: { title?: string; handle?: string; images?: Array<{ src: string }> } | null = null;

    // Step 1: Try to fetch from products.json (most reliable for Shopify)
    // Fetch multiple pages to get more products
    const allProducts: Array<{ title: string; handle: string; images?: Array<{ src: string }> }> = [];
    
    try {
      // Fetch first page
      const productsUrl = `${vendorUrl}/products.json?limit=250`;
      console.log(`📡 [FETCH] Requesting: ${productsUrl}`);
      
      // Add timeout to prevent hanging - reduced to 5 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ [TIMEOUT] Aborting request after 5 seconds...`);
        controller.abort();
      }, 5000); // 5 second timeout
      
      try {
        const productsResponse = await fetch(productsUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        console.log(`📡 [RESPONSE] Status: ${productsResponse.status} ${productsResponse.statusText}`);
      
        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          const productsCount = productsData.products?.length || 0;
          console.log(`📦 [DATA] Fetched ${productsCount} products from vendor (page 1)`);
          
          if (productsData.products) {
            allProducts.push(...productsData.products);
          }
          
          // If we got 250 products, there might be more - try to fetch page 2
          if (productsCount === 250) {
            try {
              console.log(`📡 [FETCH] Fetching page 2...`);
              const page2Url = `${vendorUrl}/products.json?limit=250&page=2`;
              const page2Response = await fetch(page2Url);
              if (page2Response.ok) {
                const page2Data = await page2Response.json();
                if (page2Data.products) {
                  allProducts.push(...page2Data.products);
                  console.log(`📦 [DATA] Fetched ${page2Data.products.length} products from page 2 (total: ${allProducts.length})`);
                }
              }
            } catch {
              console.log(`⚠️ [PAGE 2] Could not fetch page 2, continuing with ${allProducts.length} products`);
            }
          }
          
          console.log(`📦 [DATA TOTAL] Working with ${allProducts.length} total products`);
        } else {
          console.error(`❌ [ERROR] HTTP ${productsResponse.status}: ${productsResponse.statusText}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const err = fetchError as { name?: string };
        if (err.name === 'AbortError') {
          console.error('❌ [TIMEOUT] Request timed out after 10 seconds');
        } else {
          console.error('❌ [ERROR] Fetch failed:', fetchError);
        }
      }
      
      // Now search through all fetched products
      if (allProducts.length > 0) {
        // Strategy 1: Try to match by product reference first (most accurate - usually gives 1 match)
        if (productReference) {
          console.log(`🔍 [SEARCH] Strategy 1: Searching ${allProducts.length} products by reference "${productReference}"`);
          const productRefLower = productReference.toLowerCase();
          matchedProduct = allProducts.find((p: { title: string; handle: string }) => {
            const titleLower = p.title.toLowerCase();
            const handleLower = p.handle.toLowerCase();
            // Check if reference appears in title or handle
            return titleLower.includes(productRefLower) || handleLower.includes(productRefLower);
          }) || null;
          
          if (matchedProduct) {
            console.log(`✅ [MATCH] Found exact match by reference "${productReference}": ${matchedProduct.title}`);
          } else {
            console.log(`❌ [NO MATCH] No product found with reference "${productReference}"`);
            console.log(`💡 [TIP] Product might not be published on website, or reference format is different`);
          }
        }
        
        // Strategy 2: Fall back to name matching if reference didn't work
        if (!matchedProduct && productName) {
          console.log(`🔍 [SEARCH] Strategy 2: Fallback to name search "${productName}"`);
          
          const productNameLower = productName.toLowerCase();
          const matches = allProducts.filter((p: { title: string }) => {
            const titleLower = p.title.toLowerCase();
            // Try exact match first
            if (titleLower === productNameLower) return true;
            // Then try contains
            return titleLower.includes(productNameLower) || productNameLower.includes(titleLower);
          });
          
          if (matches.length > 0) {
            // Sort matches - prefer exact matches
            matches.sort((a, b) => {
              const aTitle = a.title.toLowerCase();
              const bTitle = b.title.toLowerCase();
              if (aTitle === productNameLower) return -1;
              if (bTitle === productNameLower) return 1;
              return 0;
            });
            
            matchedProduct = matches[0];
            console.log(`✅ [MATCH] Found ${matches.length} match(es) by name, using best match: ${matchedProduct.title}`);
            if (matches.length > 1) {
              console.log(`💡 [INFO] Other matches: ${matches.slice(1, 3).map(m => m.title).join(', ')}`);
            }
          } else {
            console.log(`❌ [NO MATCH] No product found with name "${productName}"`);
            console.log(`💡 [TIP] Product might not be published on website or has different name`);
          }
        }
        
        if (matchedProduct && matchedProduct.images) {
          productImages = matchedProduct.images
            .slice(0, 3)
            .map((img: { src: string }) => img.src);
          console.log(`📸 [IMAGES] Extracted ${productImages.length} image URLs from "${matchedProduct.title}":`, productImages);
        } else if (matchedProduct) {
          console.log(`⚠️ [NO IMAGES] Product found but has no images: ${matchedProduct.title}`);
        }
      } else {
        console.error(`❌ [ERROR] No products fetched from vendor website`);
      }
    } catch (fetchError) {
      const err = fetchError as { name?: string };
      if (err.name === 'AbortError') {
        console.error('❌ [TIMEOUT] Request timed out after 5 seconds');
      } else {
        console.error('❌ [ERROR] Fetch failed:', fetchError);
      }
    }

    if (productImages.length === 0) {
      console.log(`❌ [FAIL] No images found for this product`);
      return res.status(404).json({ 
        success: false, 
        error: 'No images found for this product',
        message: 'Product not found on vendor website or no images available'
      });
    }

    console.log(`✅ [SUCCESS] Found ${productImages.length} images for product`);

    // Step 2: Download images and convert to base64
    console.log(`📥 [DOWNLOAD] Starting download of ${productImages.length} images...`);
    const imageData: Array<{ url: string; base64: string }> = [];
    
    for (let i = 0; i < productImages.length; i++) {
      const imageUrl = productImages[i];
      try {
        console.log(`📥 [DOWNLOAD ${i + 1}/${productImages.length}] Fetching: ${imageUrl}`);
        
        // Add timeout to prevent hanging on large images - reduced timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log(`⏰ [TIMEOUT] Aborting image download after 8 seconds...`);
          controller.abort();
        }, 8000); // 8 second timeout per image
        
        const imageResponse = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        console.log(`📥 [DOWNLOAD ${i + 1}/${productImages.length}] Response: ${imageResponse.status} ${imageResponse.statusText}`);
        
        if (!imageResponse.ok) {
          throw new Error(`HTTP ${imageResponse.status}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        const bufferSize = imageBuffer.byteLength;
        console.log(`📥 [DOWNLOAD ${i + 1}/${productImages.length}] Downloaded ${bufferSize} bytes (${(bufferSize / 1024).toFixed(2)} KB)`);
        
        const base64 = Buffer.from(imageBuffer).toString('base64');
        console.log(`📥 [DOWNLOAD ${i + 1}/${productImages.length}] Converted to base64 (${base64.length} chars)`);
        
        imageData.push({
          url: imageUrl,
          base64: base64,
        });
        console.log(`✅ [DOWNLOAD ${i + 1}/${productImages.length}] Complete`);
      } catch (imgError) {
        const err = imgError as { name?: string; message?: string };
        if (err.name === 'AbortError') {
          console.error(`❌ [DOWNLOAD ${i + 1}/${productImages.length}] Timeout after 15 seconds: ${imageUrl}`);
        } else {
          console.error(`❌ [DOWNLOAD ${i + 1}/${productImages.length}] Failed (${err.message}): ${imageUrl}`);
        }
      }
    }

    if (imageData.length === 0) {
      console.error(`❌ [FAIL] Failed to download any images`);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to download any images' 
      });
    }

    console.log(`✅ [DOWNLOAD COMPLETE] Successfully downloaded ${imageData.length} images`);

    // Step 3: Upload images to Odoo as product images
    console.log(`☁️ [UPLOAD] Starting upload of ${imageData.length} images to Odoo...`);
    const uploadResults = [];
    
    for (let i = 0; i < imageData.length; i++) {
      const img = imageData[i];
      
      try {
        console.log(`☁️ [UPLOAD ${i + 1}/${imageData.length}] Uploading to Odoo (template ID: ${templateId})...`);
        console.log(`☁️ [UPLOAD ${i + 1}/${imageData.length}] Image size: ${img.base64.length} chars (base64)`);
        
        // Create product.image record
        const imageId = await callOdoo(
          parseInt(uid),
          password,
          'product.image',
          'create',
          [{
            name: `Image ${i + 1}`,
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
        
        console.log(`✅ [UPLOAD ${i + 1}/${imageData.length}] Success! Image ID: ${imageId}`);
      } catch (uploadError) {
        console.error(`❌ [UPLOAD ${i + 1}/${imageData.length}] Failed to upload image:`, uploadError);
        uploadResults.push({
          success: false,
          error: String(uploadError),
          sequence: i + 1,
          url: img.url,
        });
      }
    }

    const successCount = uploadResults.filter(r => r.success).length;
    console.log(`🎉 [COMPLETE] Uploaded ${successCount}/${imageData.length} images successfully`);

    return res.status(200).json({
      success: true,
      imagesFound: productImages.length,
      imagesDownloaded: imageData.length,
      imagesUploaded: successCount,
      results: uploadResults,
    });

  } catch (error) {
    console.error('❌ [FATAL ERROR] Fetch images error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch images',
    });
  }
}


