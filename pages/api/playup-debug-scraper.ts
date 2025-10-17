import type { NextApiRequest, NextApiResponse } from 'next';

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

    console.log('🔍 DEBUG: Testing scraper patterns...');

    // Step 1: Login
    const homeResponse = await fetch('https://pro.playupstore.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    const sessionCookie = homeResponse.headers.get('set-cookie')?.match(/PHPSESSID=[^;]+/)?.[0] || '';

    const loginResponse = await fetch('https://pro.playupstore.com/checkout/b2b/dologin.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': sessionCookie,
        'Referer': 'https://pro.playupstore.com/',
      },
      body: new URLSearchParams({ csrf: '', b2b: '1', email: username, password: password }).toString(),
      redirect: 'manual',
    });

    if (loginResponse.status !== 302) {
      return res.status(401).json({ success: false, error: 'Login failed' });
    }

    const loginCookies = loginResponse.headers.get('set-cookie');
    const allCookies = [sessionCookie, ...(loginCookies || '').split(',').map(c => c.split(';')[0].trim())].filter(c => c).join('; ');
    
    console.log('✅ Login successful');

    // Step 2: Fetch test page
    const testUrl = 'https://pro.playupstore.com/en/ss25-re-orders_277-345.html?p=1';
    console.log(`📄 Fetching: ${testUrl}`);
    
    const pageResponse = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': allCookies,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await pageResponse.text();
    
    console.log('\n🧪 TESTING PATTERNS:');
    console.log('='.repeat(80));
    
    // Test all patterns
    const results: Record<string, number> = {};
    
    // Pattern 1: URLs
    const urlPattern1 = /<a[^>]+href=["']([^"']+_p\d+\.html[^"']*?)["'][^>]*ng-click/gi;
    const urlMatches1 = [...html.matchAll(urlPattern1)];
    console.log(`\n1️⃣ URLs (with ng-click): ${urlMatches1.length}`);
    if (urlMatches1.length > 0) {
      console.log(`   Sample: ${urlMatches1[0][1]}`);
    }
    results.urls_with_ngclick = urlMatches1.length;
    
    // Try alternative URL pattern
    const urlPattern2 = /<a[^>]+href=["']([^"']*\/[^"']*_p\d+\.html[^"']*?)["']/gi;
    const urlMatches2 = [...html.matchAll(urlPattern2)];
    console.log(`\n   Alternative (any _p\\d+.html): ${urlMatches2.length}`);
    if (urlMatches2.length > 0) {
      console.log(`   Sample: ${urlMatches2[0][1]}`);
    }
    results.urls_alternative = urlMatches2.length;
    
    // Pattern 2: Product names
    const namePattern = /<p class=["']name["']>([^<]+)<\/p>/gi;
    const nameMatches = [...html.matchAll(namePattern)];
    console.log(`\n2️⃣ Product names (<p class="name">): ${nameMatches.length}`);
    if (nameMatches.length > 0) {
      console.log(`   Sample: ${nameMatches[0][1]}`);
    }
    results.names = nameMatches.length;
    
    // Pattern 3: Article codes
    const articlePattern = /<p class=["']small["']>(PA[A-Z0-9]+\/[A-Z0-9]+)<\/p>/gi;
    const articleMatches = [...html.matchAll(articlePattern)];
    console.log(`\n3️⃣ Article codes (<p class="small">PA...): ${articleMatches.length}`);
    if (articleMatches.length > 0) {
      console.log(`   Sample: ${articleMatches[0][1]}`);
    }
    results.articles = articleMatches.length;
    
    // Pattern 4: PVPR prices (test with € and &euro;)
    const pvprPattern1 = /<p class=["']price_rrp-value["'][^>]*>\s*(\d+[.,]\d{2})\s*€/gi;
    const pvprMatches1 = [...html.matchAll(pvprPattern1)];
    console.log(`\n4️⃣ PVPR prices (with €): ${pvprMatches1.length}`);
    
    const pvprPattern2 = /<p class=["']price_rrp-value["'][^>]*>\s*(\d+[.,]\d{2})\s*&euro;/gi;
    const pvprMatches2 = [...html.matchAll(pvprPattern2)];
    console.log(`   PVPR prices (with &euro;): ${pvprMatches2.length}`);
    if (pvprMatches2.length > 0) {
      console.log(`   Sample: ${pvprMatches2[0][1]}€`);
    }
    results.pvpr = pvprMatches2.length;
    
    // Pattern 5: Wholesale prices (test with € and &euro;)
    const wholesalePattern1 = /<p class=["'](?:previous-)?price-value["'][^>]*>\s*(\d+[.,]\d{2})\s*€/gi;
    const wholesaleMatches1 = [...html.matchAll(wholesalePattern1)];
    console.log(`\n5️⃣ Wholesale prices (with €): ${wholesaleMatches1.length}`);
    
    const wholesalePattern2 = /<p class=["'](?:previous-)?price-value["'][^>]*>\s*(\d+[.,]\d{2})\s*&euro;/gi;
    const wholesaleMatches2 = [...html.matchAll(wholesalePattern2)];
    console.log(`   Wholesale prices (with &euro;): ${wholesaleMatches2.length}`);
    if (wholesaleMatches2.length > 0) {
      console.log(`   Sample: ${wholesaleMatches2[0][1]}€`);
    }
    results.wholesale = wholesaleMatches2.length;
    
    // Find product blocks manually
    console.log('\n\n🔍 MANUAL EXTRACTION TEST:');
    console.log('='.repeat(80));
    
    // Look for the first complete product block
    const sampleProductMatch = html.match(/<div class="product-miniature[^"]*"[^>]*>([\s\S]{0,3000}?)<\/div>\s*<\/div>\s*<\/div>/i);
    if (sampleProductMatch) {
      const productBlock = sampleProductMatch[0];
      console.log('\n📦 Found product block (first 1000 chars):');
      console.log(productBlock.substring(0, 1000));
      
      // Try to extract from this block
      const blockUrl = productBlock.match(/href=["']([^"']+\.html[^"']*?)["']/i);
      const blockName = productBlock.match(/<p[^>]*class=["'][^"']*name[^"']*["'][^>]*>([^<]+)<\/p>/i);
      const blockArticle = productBlock.match(/<p[^>]*class=["'][^"']*small[^"']*["'][^>]*>([^<]+)<\/p>/i);
      const blockPVPR = productBlock.match(/PVPR[^€]*?(\d+[.,]\d{2})\s*€/i);
      const blockWholesale = productBlock.match(/Price[^€]*?(\d+[.,]\d{2})\s*€/i);
      
      console.log('\n   Extracted from block:');
      console.log(`   URL: ${blockUrl ? blockUrl[1] : 'NOT FOUND'}`);
      console.log(`   Name: ${blockName ? blockName[1] : 'NOT FOUND'}`);
      console.log(`   Article: ${blockArticle ? blockArticle[1] : 'NOT FOUND'}`);
      console.log(`   PVPR: ${blockPVPR ? blockPVPR[1] : 'NOT FOUND'}`);
      console.log(`   Wholesale: ${blockWholesale ? blockWholesale[1] : 'NOT FOUND'}`);
    }
    
    console.log('\n\n' + '='.repeat(80));
    console.log('✅ Debug complete');
    
    return res.status(200).json({
      success: true,
      patterns: results,
      minMatch: Math.min(
        results.urls_with_ngclick,
        results.names,
        results.articles,
        results.pvpr,
        results.wholesale
      ),
      htmlSample: sampleProductMatch ? sampleProductMatch[0].substring(0, 2000) : 'No product block found',
    });

  } catch (error) {
    console.error('Debug error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Debug failed',
    });
  }
}

