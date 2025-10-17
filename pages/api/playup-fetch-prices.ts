import type { NextApiRequest, NextApiResponse } from 'next';

interface ProductInfo {
  article: string;
  description: string;
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
      products: ProductInfo[]; // Array of {article, description}
    };

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing Play UP credentials' });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    console.log(`🎮 Fetching wholesale prices for ${products.length} Play UP products...`);

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

    // Step 3: Search for each product by description and extract price
    const prices: Record<string, number> = {};
    const notFound: string[] = [];
    
    for (const product of products) {
      try {
        console.log(`\n🔍 Searching for: ${product.description}`);
        console.log(`   Article: ${product.article}`);
        
        // Search by description
        const searchUrl = `https://pro.playupstore.com/en/search-page_36.html?c=1&term=${encodeURIComponent(product.description)}`;
        console.log(`   URL: ${searchUrl}`);
        
        const searchResponse = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': allCookies,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (searchResponse.ok) {
          const html = await searchResponse.text();
          
          // Check if search returned any products
          const hasProducts = html.includes('class="product-item"') || html.includes('class="rdc-product-price"');
          console.log(`   Has products in results: ${hasProducts ? 'YES' : 'NO'}`);
          
          // Extract wholesale price (the current discounted price or original wholesale price)
          // Pattern: <p class="previous-price-value">10,08€</p> or <p class="rdc-product-price">8,06€</p>
          
          // Try to find the original wholesale price first (more accurate)
          let priceMatch = html.match(/<p class="previous-price-value"[^>]*>\s*(\d+[.,]\d{2})/);
          let priceSource = 'previous-price-value';
          
          // If not found, try the current (discounted) price
          if (!priceMatch) {
            priceMatch = html.match(/<p class="bold rdc-product-price[^"]*"[^>]*>\s*(\d+[.,]\d{2})/);
            priceSource = 'rdc-product-price';
          }
          
          if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(',', '.'));
            prices[product.article] = price;
            console.log(`  ✅ Found wholesale price: €${price} (source: ${priceSource})`);
          } else {
            notFound.push(product.article);
            console.log(`  ❌ Price not found in search results`);
            
            // Debug: Show what price patterns we found (if any)
            const allPrices = html.match(/(\d+[.,]\d{2})€/g);
            if (allPrices && allPrices.length > 0) {
              console.log(`  💡 Found other prices in page: ${allPrices.slice(0, 5).join(', ')}`);
            } else {
              console.log(`  💡 No prices found on page at all`);
            }
            
            // Check for "no results" message
            if (html.includes('No results found') || html.includes('Aucun résultat')) {
              console.log(`  💡 Search returned "No results found"`);
            }
          }
        } else {
          notFound.push(product.article);
          console.log(`  ❌ Search failed (HTTP ${searchResponse.status})`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (productError) {
        console.error(`Error fetching ${product.article}:`, productError);
        notFound.push(product.article);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Found: ${Object.keys(prices).length} wholesale prices`);
    console.log(`❌ Not found: ${notFound.length} products`);
    
    if (notFound.length > 0) {
      console.log(`\n❌ Missing products:`);
      notFound.forEach(code => {
        const prod = products.find(p => p.article === code);
        console.log(`   ${code}: ${prod?.description || 'unknown'}`);
      });
    }

    return res.status(200).json({
      success: true,
      prices,
      count: Object.keys(prices).length,
      notFound,
      message: `Found ${Object.keys(prices).length} of ${products.length} prices`,
    });

  } catch (error) {
    console.error('Play UP price fetch error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch prices',
    });
  }
}

