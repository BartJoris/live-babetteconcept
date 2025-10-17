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

    console.log('🔍 Testing Play UP HTML structure...');

    // Step 1: Get homepage
    const homeResponse = await fetch('https://pro.playupstore.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    const homeCookies = homeResponse.headers.get('set-cookie');
    const sessionCookie = homeCookies?.match(/PHPSESSID=[^;]+/)?.[0] || '';

    // Step 2: Login
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
        error: 'Login failed' 
      });
    }

    const loginCookies = loginResponse.headers.get('set-cookie');
    const allCookies = [sessionCookie, ...(loginCookies || '').split(',').map(c => c.split(';')[0].trim())].filter(c => c).join('; ');
    
    console.log('✅ Login successful');

    // Step 3: Fetch test page
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
    
    // Analyze HTML structure
    console.log('\n📊 HTML ANALYSIS:');
    console.log(`Total length: ${html.length} chars`);
    
    // Count various elements
    const imgTags = (html.match(/<img/gi) || []).length;
    const productItems = (html.match(/product-item/gi) || []).length;
    const productSkus = (html.match(/sku_family/gi) || []).length;
    const priceMatches = (html.match(/PVPR/gi) || []).length;
    const viewMoreButton = html.includes('View More Products');
    
    console.log(`<img> tags: ${imgTags}`);
    console.log(`"product-item": ${productItems}`);
    console.log(`"sku_family": ${productSkus}`);
    console.log(`"PVPR": ${priceMatches}`);
    console.log(`"View More Products": ${viewMoreButton}`);
    
    // Extract sample data
    const sampleArticles = [];
    const articleMatches = html.matchAll(/PA\d+\/\d+[A-Z]+\d+/gi);
    for (const match of articleMatches) {
      sampleArticles.push(match[0]);
      if (sampleArticles.length >= 10) break;
    }
    
    const sampleProducts = [];
    const productMatches = html.matchAll(/<h3[^>]*>(.*?)<\/h3>/gi);
    for (const match of productMatches) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text && text.length > 3 && text.length < 100) {
        sampleProducts.push(text);
        if (sampleProducts.length >= 10) break;
      }
    }
    
    const sampleUrls = [];
    const urlMatches = html.matchAll(/href=["']([^"']*\.html[^"']*)["']/gi);
    for (const match of urlMatches) {
      const url = match[1];
      if (url.includes('/en/') && !url.includes('checkout') && !url.includes('menu')) {
        sampleUrls.push(url);
        if (sampleUrls.length >= 10) break;
      }
    }
    
    // Get a snippet of HTML around first product
    const productSnippetMatch = html.match(/([\s\S]{500})PA\d+\/\d+[A-Z]+\d+([\s\S]{500})/);
    const productSnippet = productSnippetMatch ? productSnippetMatch[0] : '';
    
    return res.status(200).json({
      success: true,
      analysis: {
        htmlLength: html.length,
        counts: {
          imgTags,
          productItems,
          productSkus,
          priceMatches,
          viewMoreButton,
        },
        samples: {
          articles: sampleArticles,
          products: sampleProducts,
          urls: sampleUrls,
        },
        htmlSnippet: productSnippet.substring(0, 2000),
        fullHtmlPreview: html.substring(0, 5000),
      },
    });

  } catch (error) {
    console.error('Test error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Test failed',
    });
  }
}

