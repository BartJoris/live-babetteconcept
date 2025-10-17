import type { NextApiRequest, NextApiResponse } from 'next';

interface ScrapedProduct {
  article: string;
  name: string;
  pvpr: number;
  wholesalePrice: number;
  discountedPrice: number;
  productUrl: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing Play UP credentials' });
    }

    console.log('🚀 Starting Play UP product scraping...');

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

    // Step 3: Scrape all products from collection pages
    console.log('Step 3: Fetching all products...');
    const products: ScrapedProduct[] = [];
    
    // Main collections to scrape (SS25, AW25, etc.)
    const collections = [
      { name: 'SS25 Re-orders', id: '277' },
      { name: 'AW25', id: '271' }, // Adjust as needed
    ];

    for (const collection of collections) {
      console.log(`\n📂 Collection: ${collection.name}`);
      
      let currentPage = 1;
      let hasMoreProducts = true;
      let consecutiveEmptyPages = 0;
      
      while (hasMoreProducts && currentPage <= 50) { // Max 50 pages to ensure we get all 200+ products
        const catalogUrl = `https://pro.playupstore.com/en/ss25-re-orders_${collection.id}-345.html?p=${currentPage}`;
        console.log(`  📄 Page ${currentPage}: ${catalogUrl}`);
        
        try {
          const catalogResponse = await fetch(catalogUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Cookie': allCookies,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });

          if (!catalogResponse.ok) {
            console.warn(`  ⚠️ Failed to fetch page ${currentPage}`);
            break;
          }

          const html = await catalogResponse.text();
          
          // Extract each piece separately and match them up
          // 1. Find all product URLs
          const urlMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+_p\d+\.html[^"']*?)["'][^>]*ng-click/gi)];
          
          // 2. Find all product names
          const nameMatches = [...html.matchAll(/<p class=["']name["']>([^<]+)<\/p>/gi)];
          
          // 3. Find all article codes
          const articleMatches = [...html.matchAll(/<p class=["']small["']>(PA[A-Z0-9]+\/[A-Z0-9]+)<\/p>/gi)];
          
          // 4. Find all PVPR prices (handles both € and &euro;)
          const pvprMatches = [...html.matchAll(/<p class=["']price_rrp-value["'][^>]*>\s*(\d+[.,]\d{2})\s*(?:€|&euro;)/gi)];
          
          // 5. Find all wholesale prices (handles both € and &euro;, previous-price-value or just price-value)
          const wholesaleMatches = [...html.matchAll(/<p class=["'](?:previous-)?price-value["'][^>]*>\s*(\d+[.,]\d{2})\s*(?:€|&euro;)/gi)];
          
          console.log(`    📊 Raw matches found: URLs=${urlMatches.length}, Names=${nameMatches.length}, Articles=${articleMatches.length}, PVPR=${pvprMatches.length}, Wholesale=${wholesaleMatches.length}`);
          
          // Match them up (they should be in the same order)
          const minLength = Math.min(
            urlMatches.length,
            nameMatches.length, 
            articleMatches.length,
            pvprMatches.length,
            wholesaleMatches.length
          );
          
          let pageCount = 0;
          
          for (let i = 0; i < minLength; i++) {
            const url = urlMatches[i][1];
            const name = nameMatches[i][1].trim();
            const article = articleMatches[i][1];
            const pvpr = parseFloat(pvprMatches[i][1].replace(',', '.'));
            const wholesalePrice = parseFloat(wholesaleMatches[i][1].replace(',', '.'));
            
            // Make URL absolute
            const fullUrl = url.startsWith('http') 
              ? url 
              : `https://pro.playupstore.com${url}`;
            
            // Try to find discount price if it exists (look for "Discount" text near this article)
            let discountedPrice = 0;
            const discountPattern = new RegExp(`${article.replace(/\//g, '\\/')}[\\s\\S]{0,800}Discount[\\s\\S]{0,200}(\\d+[.,]\\d{2})\\s*(?:€|&euro;)`, 'i');
            const discountMatch = html.match(discountPattern);
            if (discountMatch) {
              discountedPrice = parseFloat(discountMatch[1].replace(',', '.'));
            }
            
            products.push({
              article,
              name,
              productUrl: fullUrl,
              pvpr,
              wholesalePrice,
              discountedPrice,
            });
            pageCount++;
          }
          
          if (minLength === 0) {
            console.log(`    ⚠️ No complete product data found. Debug info:`);
            console.log(`       - URLs with "_p\\d+.html": ${urlMatches.length}`);
            console.log(`       - <p class="name">: ${nameMatches.length}`);
            console.log(`       - Article codes (PA...): ${articleMatches.length}`);
            console.log(`       - PVPR prices: ${pvprMatches.length}`);
            console.log(`       - Wholesale prices: ${wholesaleMatches.length}`);
          }
          
          console.log(`    ✅ Found ${pageCount} products on this page (total: ${products.length})`);
          
          // Check if we should continue
          if (pageCount === 0) {
            consecutiveEmptyPages++;
            console.log(`    ⚠️ Empty page ${consecutiveEmptyPages}/3`);
            
            // Stop if we've hit 3 consecutive empty pages
            if (consecutiveEmptyPages >= 3) {
              console.log(`    🛑 Stopping: 3 consecutive empty pages`);
              hasMoreProducts = false;
            }
          } else {
            // Reset counter when we find products
            consecutiveEmptyPages = 0;
          }
          
          currentPage++;
          
          // Small delay between pages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`  ❌ Error fetching page ${currentPage}:`, error);
          break;
        }
      }
      
      console.log(`  ✅ Collection "${collection.name}" complete: ${products.length} total products found`);
      console.log(`  📄 Total pages scraped: ${currentPage - 1}`);
    }

    // Remove duplicates based on article code
    const uniqueProducts = Array.from(
      new Map(products.map(p => [p.article, p])).values()
    );

    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`✅ Total products scraped: ${uniqueProducts.length}`);
    console.log(`🔗 All products have URLs for direct access`);
    console.log(`🗑️ Duplicates removed: ${products.length - uniqueProducts.length}`);

    return res.status(200).json({
      success: true,
      products: uniqueProducts,
      count: uniqueProducts.length,
    });

  } catch (error) {
    console.error('Play UP scraping error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to scrape products',
    });
  }
}

