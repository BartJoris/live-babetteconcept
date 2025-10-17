import type { NextApiRequest, NextApiResponse } from 'next';

interface ProductInfo {
  article: string;
  description: string;
}

interface ImageResult {
  article: string;
  description: string;
  images: string[];
  found: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password, products } = req.body as {
      username: string;
      password: string;
      products: ProductInfo[];
    };

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing Play UP credentials' });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    console.log(`🖼️ Fetching images for ${products.length} Play UP products...`);

    // Step 1: Get homepage to establish session
    console.log('Step 1: Getting homepage...');
    const homeResponse = await fetch('https://pro.playupstore.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    const homeCookies = homeResponse.headers.get('set-cookie');
    const sessionCookie = homeCookies?.match(/PHPSESSID=[^;]+/)?.[0] || '';

    // Step 2: Login
    console.log('Step 2: Logging in...');
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
        email: username,
        password: password,
      }).toString(),
      redirect: 'manual',
    });

    if (loginResponse.status !== 302) {
      return res.status(401).json({ 
        success: false, 
        error: 'Login failed. Check credentials.' 
      });
    }

    const loginCookies = loginResponse.headers.get('set-cookie');
    const allCookies = [sessionCookie, ...(loginCookies || '').split(',').map(c => c.split(';')[0].trim())].filter(c => c).join('; ');
    
    console.log('✅ Login successful');

    // Step 3: Search for each product and extract images
    const results: ImageResult[] = [];
    
    for (const product of products) {
      try {
        console.log(`\n🔍 Searching images for: ${product.description}`);
        
        const searchUrl = `https://pro.playupstore.com/en/search-page_36.html?c=1&term=${encodeURIComponent(product.description)}`;
        const searchResponse = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': allCookies,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (searchResponse.ok) {
          const html = await searchResponse.text();
          
          // Check if we're getting actual search results (same check as price fetcher)
          const hasProducts = html.includes('class="product-item"') || html.includes('class="rdc-product-price"');
          const noResults = html.includes('No results found') || html.includes('Aucun résultat');
          
          console.log(`   Has products in HTML: ${hasProducts ? 'YES' : 'NO'}`);
          console.log(`   No results message: ${noResults ? 'YES' : 'NO'}`);
          
          // Step 1: Extract product detail page URL from search results
          let productPageUrl: string | null = null;
          
          // Look for product links - common patterns:
          // <a href="/en/product-name.html" class="product-link">
          // <a class="product_img_link" href="/en/...">
          const productLinkPatterns = [
            /<a[^>]*href=["']([^"']*\.html[^"']*)["'][^>]*class=["'][^"']*product/gi,
            /<a[^>]*class=["'][^"']*product[^"']*["'][^>]*href=["']([^"']*\.html[^"']*)["']/gi,
            /<a[^>]*href=["']([^"']*-[0-9]+\.html)["']/gi, // product URLs often have numbers
          ];
          
          for (const pattern of productLinkPatterns) {
            const matches = html.matchAll(pattern);
            for (const match of matches) {
              const url = match[1];
              if (url && !url.includes('javascript:') && !url.includes('#')) {
                productPageUrl = url.startsWith('http') 
                  ? url 
                  : `https://pro.playupstore.com${url.startsWith('/') ? '' : '/'}${url}`;
                console.log(`   📍 Found product page: ${productPageUrl}`);
                break;
              }
            }
            if (productPageUrl) break;
          }
          
          // Step 2: If we found a product page, fetch images from it
          const imageUrls: string[] = [];
          
          if (productPageUrl) {
            console.log(`   🌐 Fetching product page for images...`);
            try {
              const productPageResponse = await fetch(productPageUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Cookie': allCookies,
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
              });
              
              if (productPageResponse.ok) {
                const productHtml = await productPageResponse.text();
                
                // Extract images from product detail page
                // Look for larger product images (not thumbnails)
                const productImgPatterns = [
                  /data-image-large-src=["']([^"']+)["']/gi,
                  /data-zoom-image=["']([^"']+)["']/gi,
                  /<img[^>]*class=["'][^"']*product[^"']*["'][^>]*src=["']([^"']+)["']/gi,
                  /<img[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*product[^"']*["']/gi,
                ];
                
                for (const pattern of productImgPatterns) {
                  const matches = productHtml.matchAll(pattern);
                  for (const match of matches) {
                    let imgUrl = match[1];
                    if (imgUrl && !imgUrl.includes('data:image')) {
                      // Convert to absolute URL
                      if (!imgUrl.startsWith('http')) {
                        if (imgUrl.startsWith('//')) {
                          imgUrl = 'https:' + imgUrl;
                        } else if (imgUrl.startsWith('/')) {
                          imgUrl = 'https://pro.playupstore.com' + imgUrl;
                        } else {
                          imgUrl = 'https://pro.playupstore.com/' + imgUrl;
                        }
                      }
                      const cleanUrl = imgUrl.split('?')[0];
                      if (!imageUrls.includes(cleanUrl) && 
                          !cleanUrl.includes('logo') && 
                          !cleanUrl.includes('icon')) {
                        imageUrls.push(cleanUrl);
                      }
                    }
                  }
                }
                
                console.log(`   ✅ Extracted ${imageUrls.length} images from product page`);
              }
            } catch (error) {
              console.error(`   ❌ Error fetching product page:`, error);
            }
          }
          
          // Fallback: Try to extract images from search results if no product page found
          if (imageUrls.length === 0 && hasProducts) {
            console.log(`   🔄 Fallback: Extracting images from search results...`);
            
            // Method 1: Find ALL img tags and filter
            const allImgMatches = html.matchAll(/<img[^>]+>/gi);
            let totalImgTags = 0;
          
          for (const match of allImgMatches) {
            totalImgTags++;
            const imgTag = match[0];
            
            // Extract src or data-src
            const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
            const dataSrcMatch = imgTag.match(/data-src=["']([^"']+)["']/i);
            
            const src = srcMatch?.[1] || dataSrcMatch?.[1];
            
            if (!src) continue;
            
            // Debug: Log first 10 image sources
            if (totalImgTags <= 10) {
              console.log(`   Img ${totalImgTags}: ${src.substring(0, 100)}`);
            }
            
            // Skip obvious non-product images
            if (src.includes('logo') || 
                src.includes('icon') || 
                src.includes('banner') ||
                src.includes('sprite') ||
                src.includes('pixel') ||
                src.includes('tracking')) {
              continue;
            }
            
            // Include images that look like products
            // Most product images end in .jpg, .jpeg, .png and are not tiny icons
            if ((src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp')) &&
                !src.includes('data:image')) {
              
              // Convert relative URLs to absolute
              let absoluteUrl = src;
              if (!src.startsWith('http')) {
                if (src.startsWith('//')) {
                  absoluteUrl = 'https:' + src;
                } else if (src.startsWith('/')) {
                  absoluteUrl = 'https://pro.playupstore.com' + src;
                } else {
                  absoluteUrl = 'https://pro.playupstore.com/' + src;
                }
              }
              
              // Remove query parameters and duplicates
              const cleanUrl = absoluteUrl.split('?')[0];
              if (!imageUrls.includes(cleanUrl)) {
                imageUrls.push(cleanUrl);
              }
            }
          }
          
            console.log(`   Total <img> tags found: ${totalImgTags}`);
            console.log(`   Product images extracted: ${imageUrls.length}`);
            
            // Debug: If no images found but products exist, show HTML snippet
            if (imageUrls.length === 0 && results.length === 0) {
              // Find the first product-item and show it
              const productItemMatch = html.match(/<[^>]*class="[^"]*product-item[^"]*"[^>]*>[\s\S]{0,1000}/i);
              if (productItemMatch) {
                console.log(`\n📄 PRODUCT ITEM SNIPPET:\n${productItemMatch[0]}\n`);
              } else {
                const snippet = html.substring(0, 3000);
                console.log(`\n📄 HTML SNIPPET (first 3000 chars):\n${snippet}\n`);
              }
            }
          }

          if (imageUrls.length > 0) {
            results.push({
              article: product.article,
              description: product.description,
              images: imageUrls.slice(0, 10), // Limit to 10 images per product
              found: true,
            });
            console.log(`  ✅ Found ${imageUrls.length} images`);
          } else {
            results.push({
              article: product.article,
              description: product.description,
              images: [],
              found: false,
            });
            console.log(`  ❌ No images found`);
          }
        } else {
          results.push({
            article: product.article,
            description: product.description,
            images: [],
            found: false,
            error: `Search failed (HTTP ${searchResponse.status})`,
          });
          console.log(`  ❌ Search failed`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (productError) {
        console.error(`Error fetching images for ${product.article}:`, productError);
        results.push({
          article: product.article,
          description: product.description,
          images: [],
          found: false,
          error: String(productError),
        });
      }
    }

    const foundCount = results.filter(r => r.found).length;
    const totalImages = results.reduce((sum, r) => sum + r.images.length, 0);
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Found images: ${foundCount} products`);
    console.log(`📸 Total images: ${totalImages}`);
    console.log(`❌ No images: ${results.length - foundCount} products`);

    return res.status(200).json({
      success: true,
      results,
      foundCount,
      totalImages,
      message: `Found images for ${foundCount} of ${products.length} products`,
    });

  } catch (error) {
    console.error('Play UP image fetch error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch images',
    });
  }
}
