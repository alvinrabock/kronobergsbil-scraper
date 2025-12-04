"use server";
import puppeteer from 'puppeteer';

// Helper function to categorize PDF type
function categorizePDFType(url: string): 'pricelist' | 'brochure' | 'specifications' | 'unknown' {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('prislista') || urlLower.includes('pricelist') || urlLower.includes('price')) {
    return 'pricelist';
  }
  if (urlLower.includes('broschyr') || urlLower.includes('brochure') || urlLower.includes('_8s_') || urlLower.includes('_12s_')) {
    return 'brochure';
  }
  if (urlLower.includes('spec') || urlLower.includes('technical')) {
    return 'specifications';
  }
  return 'unknown';
}

// Extract PDF links from HTML content
function extractPDFsFromHTML(html: string, pageUrl: string): PDFLink[] {
  const pdfLinks: PDFLink[] = [];
  const seenUrls = new Set<string>();

  // Pattern to find PDF links
  const patterns = [
    /href=["']([^"']*\.pdf[^"']*)["']/gi,
    /https?:\/\/[^\s"'<>]+\.pdf/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let pdfUrl = match[1] || match[0];
      pdfUrl = pdfUrl.split('?')[0]; // Remove query params

      // Convert relative to absolute
      if (pdfUrl.startsWith('/')) {
        try {
          const url = new URL(pageUrl);
          pdfUrl = `${url.protocol}//${url.host}${pdfUrl}`;
        } catch {
          continue;
        }
      } else if (!pdfUrl.startsWith('http')) {
        continue;
      }

      if (!seenUrls.has(pdfUrl)) {
        seenUrls.add(pdfUrl);
        pdfLinks.push({
          url: pdfUrl,
          type: categorizePDFType(pdfUrl),
          foundOnPage: pageUrl
        });
      }
    }
  }

  return pdfLinks;
}

export interface ScrapedData {
  title: string;
  price?: string;
  year?: string;
  mileage?: string;
  image?: string;
  link?: string;
  rawHtml?: string;
  content?: string;
}

export interface LinkedContent {
  url: string;
  title: string;
  content: string;
  cleanedHtml: string;
  linkText: string;
  success: boolean;
  error?: string;
}

export interface PageInfo {
  title: string;
  description: string;
  url: string;
  scrapedAt: string;
  contentLength: number;
  cleanedContentLength: number;
  linksFound: number;
  linksFetched: number;
}

export interface PDFLink {
  url: string;
  type: 'pricelist' | 'brochure' | 'specifications' | 'unknown';
  foundOnPage: string; // URL of the page where this PDF was found
}

export interface ScrapeResult {
  success: boolean;
  url: string;
  pageInfo: PageInfo;
  cleanedHtml: string;
  structuredData: ScrapedData[];
  linkedContent: LinkedContent[];
  pdfLinks: PDFLink[]; // PDF links found during scraping
  thumbnail?: string;
  formattedOutput?: string;
  error?: string;
}

// Helper function to create formatted output with proper tags
export async function formatScrapedContent(result: ScrapeResult): Promise<string> {
  if (!result.success) {
    return `<!-- SCRAPING FAILED -->\n<!-- URL: ${result.url} -->\n<!-- ERROR: ${result.error} -->\n`;
  }

  let combinedHtml = '';
  
  // Add main page content
  combinedHtml += `<!-- MAIN PAGE CONTENT START -->\n`;
  combinedHtml += result.cleanedHtml;
  combinedHtml += `\n<!-- MAIN PAGE CONTENT END -->\n\n`;

  // Add linked content with proper formatting and end tags
  if (result.linkedContent && result.linkedContent.length > 0) {
    const successfulLinks = result.linkedContent.filter(lc => lc.success);
    if (successfulLinks.length > 0) {
      combinedHtml += `<!-- LÄNKAT INNEHÅLL (${successfulLinks.length} sidor) -->\n\n`;
      
      result.linkedContent.forEach((link, index) => {
        if (link.success) {
          combinedHtml += `<!-- LINKED PAGE ${index + 1} START -->\n`;
          combinedHtml += `<!-- LINK TEXT: ${link.linkText} -->\n`;
          combinedHtml += `<!-- URL: ${link.url} -->\n`;
          combinedHtml += `<!-- TITLE: ${link.title} -->\n`;
          combinedHtml += `<!-- CONTENT START -->\n`;
          combinedHtml += link.cleanedHtml;
          combinedHtml += `\n<!-- CONTENT END -->\n`;
          combinedHtml += `<!-- LINKED PAGE ${index + 1} END -->\n\n`;
        }
      });
    }
  }

  return combinedHtml;
}

export async function scrapeWebsite(url: string, fetchLinks = true): Promise<ScrapeResult> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`Starting scrape of: ${url}`);
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8' });
    
    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Page loaded successfully');

    // Original HTML
    const originalHtml: string = await page.content();
    console.log(`Original HTML length: ${originalHtml.length}`);
    
    if (!originalHtml || originalHtml.length < 100) {
      throw new Error(`Page content too short or empty: ${originalHtml.length} characters`);
    }

    // Main content extraction - same logic as Cheerio version
    const mainContent = await page.evaluate(() => {
      console.log('Starting content extraction...');
      const contentSelectors = [
        'main',
        '#main', 
        '.main-section',
        '[role="main"]',
        'section.main-section',
        'article',
        '.content',
        '#content',
        '.page-content',
        'body'
      ];

      let content = '';
      
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          content = element.innerHTML;
          console.log(`Found content using selector: ${selector}, length: ${content.length}`);
          break;
        }
      }
      
      // If no main content found, get everything from body
      if (!content) {
        content = document.body?.innerHTML || '';
        console.log(`Fallback to body content, length: ${content.length}`);
      }
      
      return content;
    });

    console.log(`Main content extracted, length: ${mainContent.length}`);
    
    if (!mainContent || mainContent.length < 50) {
      throw new Error(`Main content too short: ${mainContent.length} characters`);
    }

    // Apply the exact same cleaning logic as the working Cheerio version
    const cleanedHtml = await page.evaluate((html: string, baseUrl: string) => {
      console.log('Starting HTML cleaning...');
      if (!html) {
        console.log('No HTML to clean');
        return '';
      }
      
      // Create a temporary div to work with the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      console.log('HTML loaded into temp div');
      
      // Remove only truly unnecessary elements
      const unwantedSelectors = [
        'script', 'style', 'noscript', 'link[rel="stylesheet"]', 'svg', 'path'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = tempDiv.querySelectorAll(selector);
        console.log(`Removing ${elements.length} ${selector} elements`);
        elements.forEach(el => el.remove());
      });
      
      // Remove meta tags except description (handle separately since != selector doesn't work)
      tempDiv.querySelectorAll('meta').forEach(meta => {
        const name = meta.getAttribute('name');
        if (name && name !== 'description') {
          meta.remove();
        }
      });
      
      // Handle each element type specifically to preserve important attributes
      const allElements = tempDiv.querySelectorAll('*');
      console.log(`Processing ${allElements.length} elements for attribute cleaning`);
      
      allElements.forEach((elem, index) => {
        if (index % 100 === 0) {
          console.log(`Processing element ${index}/${allElements.length}`);
        }
        
        if (elem.tagName === 'IMG') {
          // For images, preserve essential image attributes
          let src = elem.getAttribute('src') || elem.getAttribute('data-src') || elem.getAttribute('data-lazy-src');
          let srcset = elem.getAttribute('srcset');
          const alt = elem.getAttribute('alt') || '';
          
          // Handle Next.js images - extract the actual image URL
          if (src && src.includes('/_next/image/') && src.includes('url=')) {
            const urlMatch = src.match(/url=([^&]+)/);
            if (urlMatch) {
              src = decodeURIComponent(urlMatch[1]);
              console.log(`Decoded Next.js image: ${src}`);
            }
          }
          
          // Resolve relative URLs to absolute URLs
          if (src && src.startsWith('/') && baseUrl) {
            try {
              const urlBase = new URL(baseUrl);
              src = `${urlBase.protocol}//${urlBase.host}${src}`;
            } catch (e) {
              console.log('Failed to resolve relative URL:', src);
            }
          }
          
          // Resolve relative URLs in srcset
          if (srcset && baseUrl) {
            const srcsetParts = srcset.split(',').map(part => {
              const trimmed = part.trim();
              let [url, descriptor] = trimmed.split(/\s+/);
              
              // Handle Next.js URLs in srcset
              if (url.includes('/_next/image/') && url.includes('url=')) {
                const urlMatch = url.match(/url=([^&]+)/);
                if (urlMatch) {
                  url = decodeURIComponent(urlMatch[1]);
                }
              }
              
              if (url.startsWith('/')) {
                try {
                  const urlBase = new URL(baseUrl);
                  const absoluteUrl = `${urlBase.protocol}//${urlBase.host}${url}`;
                  return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
                } catch (e) {
                  return trimmed;
                }
              }
              return trimmed;
            });
            srcset = srcsetParts.join(', ');
          }
          
          // Remove all attributes
          const attributes = Array.from(elem.attributes);
          attributes.forEach(attr => elem.removeAttribute(attr.name));
          
          // Add back essential ones, but skip broken placeholder images
          if (src && !src.includes('data:image/gif;base64') && !src.includes('placeholder')) {
            elem.setAttribute('src', src);
            if (srcset) elem.setAttribute('srcset', srcset);
            elem.setAttribute('alt', alt);
          } else {
            // Remove broken/placeholder images
            elem.remove();
            return;
          }
        }
        else if (elem.tagName === 'A') {
          // For links, preserve only href and resolve relative URLs
          let href = elem.getAttribute('href');
          
          // Resolve relative URLs to absolute URLs
          if (href && href.startsWith('/') && baseUrl) {
            try {
              const urlBase = new URL(baseUrl);
              href = `${urlBase.protocol}//${urlBase.host}${href}`;
            } catch (e) {
              // Keep original href if URL parsing fails
            }
          }
          
          // Remove all attributes
          const attributes = Array.from(elem.attributes);
          attributes.forEach(attr => elem.removeAttribute(attr.name));
          
          // Add back href if it exists
          if (href) elem.setAttribute('href', href);
        }
        else {
          // For all other elements, remove only the unwanted attributes
          const removeAttrs = [
            'class', 'id', 'style',
            'data-dtm', 'data-gtm-event', 'data-gtm-event-category', 
            'data-gtm-event-action', 'data-gtm-event-label', 'data-persona',
            'data-expander-when', 'data-expander-content', 'data-expander-header',
            'data-aspect-ratio', 'sizes', 'decoding', 'loading', 'data-mode',
            'data-group', 'data-hs-cf-bound', 'anchor-name', 'draggable',
            'rel', 'disabled', 'fill', 'xmlns', 'width', 'height',
            'role', 'aria-label', 'aria-hidden', 'tabindex', 'onclick', 'onload'
          ];
          
          removeAttrs.forEach(attr => elem.removeAttribute(attr));
        }
      });
      
      console.log('Attribute cleaning completed');
      
      // Remove empty paragraphs and containers - multiple passes to catch nested empties
      for (let pass = 0; pass < 3; pass++) {
        console.log(`Empty element removal pass ${pass + 1}`);
        const emptyElements = tempDiv.querySelectorAll('p, span, div, section, figure, article, ul, li, button');
        let removedCount = 0;
        emptyElements.forEach(elem => {
          const text = elem.textContent?.trim() || '';
          const hasImage = elem.querySelector('img');
          const hasInput = elem.querySelector('input, textarea, select');
          const hasLink = elem.tagName.toLowerCase() === 'a' && elem.getAttribute('href');
          
          // Remove if empty and not an image, input, or meaningful link
          if (!text && !hasImage && !hasInput && !hasLink && elem.children.length === 0) {
            elem.remove();
            removedCount++;
          }
          // Also remove containers that only contain other empty containers
          else if (!text && !hasImage && !hasInput && !hasLink && elem.children.length > 0) {
            const hasNonEmptyChild = Array.from(elem.children).some(child => {
              return child.textContent?.trim() || 
                     child.querySelector('img, input, textarea, select') ||
                     (child.tagName.toLowerCase() === 'a' && child.getAttribute('href'));
            });
            if (!hasNonEmptyChild) {
              elem.remove();
              removedCount++;
            }
          }
        });
        console.log(`Removed ${removedCount} empty elements in pass ${pass + 1}`);
        if (removedCount === 0) break; // No more empty elements found
      }
      
      let result = tempDiv.innerHTML;
      
      // Basic formatting cleanup
      result = result
        .replace(/\n\s*\n/g, '\n')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/&nbsp;/g, ' ')
        .trim();
      
      console.log(`Cleaning completed, final length: ${result.length}`);
      return result;
    }, mainContent, url);

    console.log(`HTML cleaned, length: ${cleanedHtml.length}`);
    
    if (!cleanedHtml || cleanedHtml.length < 20) {
      console.warn('Cleaned HTML is very short, but proceeding...');
    }

    // Meta info
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      url: window.location.href,
      scrapedAt: new Date().toISOString()
    }));

    console.log(`Page info extracted: ${pageInfo.title}`);

    // Find best thumbnail with improved selection - prefer HIGH QUALITY images
    const bestThumbnail: string | undefined = await page.evaluate((baseUrl: string) => {
      try {
        const images: Array<{src: string, score: number, width: number}> = [];

        // Helper to resolve relative URLs
        const resolveUrl = (url: string): string => {
          if (!url) return '';
          if (url.startsWith('/')) {
            try {
              const urlBase = new URL(baseUrl);
              return `${urlBase.protocol}//${urlBase.host}${url}`;
            } catch (e) {
              return url;
            }
          }
          return url;
        };

        // Helper to extract best URL from srcset (highest resolution)
        const getBestFromSrcset = (srcset: string | null): { url: string, width: number } | null => {
          if (!srcset) return null;

          const entries = srcset.split(',').map(entry => {
            const parts = entry.trim().split(/\s+/);
            let url = parts[0];
            let width = 0;

            // Handle Next.js image URLs - extract real URL and width
            if (url.includes('/_next/image/') && url.includes('url=')) {
              const urlMatch = url.match(/url=([^&]+)/);
              const widthMatch = url.match(/[?&]w=(\d+)/);
              if (urlMatch) {
                url = decodeURIComponent(urlMatch[1]);
              }
              if (widthMatch) {
                width = parseInt(widthMatch[1], 10);
              }
            }

            // Parse width descriptor (e.g., "800w")
            if (parts[1] && parts[1].endsWith('w')) {
              width = parseInt(parts[1].replace('w', ''), 10) || width;
            }

            return { url: resolveUrl(url), width };
          });

          // Sort by width descending and return the largest
          entries.sort((a, b) => b.width - a.width);
          return entries.length > 0 && entries[0].width > 0 ? entries[0] : null;
        };

        document.querySelectorAll('img').forEach(img => {
          let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
          let width = 0;

          // Skip placeholder/broken images
          if (!src ||
              src.includes('data:image/gif;base64') ||
              src.includes('placeholder') ||
              src.includes('spinner') ||
              src.includes('loading') ||
              src.length < 10) {
            return;
          }

          // Try to get highest resolution from srcset first
          const srcset = img.getAttribute('srcset');
          const bestSrcset = getBestFromSrcset(srcset);
          if (bestSrcset && bestSrcset.width >= 800) {
            src = bestSrcset.url;
            width = bestSrcset.width;
          } else {
            // Handle Next.js image URLs - try to get larger version
            if (src.includes('/_next/image/') && src.includes('url=')) {
              const urlMatch = src.match(/url=([^&]+)/);
              if (urlMatch) {
                src = decodeURIComponent(urlMatch[1]);
              }
            }

            // Try to extract width from URL or img attributes
            const widthMatch = src.match(/[?&]w=(\d+)/);
            if (widthMatch) {
              width = parseInt(widthMatch[1], 10);
            }
            width = width || img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
          }

          // Resolve relative URLs
          src = resolveUrl(src);

          // Skip if we couldn't resolve the URL
          if (!src || !src.startsWith('http')) return;

          // Score images based on various factors
          let score = 0;

          // STRONGLY prefer larger images (width-based scoring)
          if (width >= 1920) score += 50;
          else if (width >= 1200) score += 40;
          else if (width >= 800) score += 30;
          else if (width >= 600) score += 20;
          else if (width >= 400) score += 10;
          else if (width > 0 && width < 200) score -= 20; // Penalize tiny images

          // Prefer images with car/vehicle related keywords in URL
          const srcLower = src.toLowerCase();
          if (srcLower.includes('car') ||
              srcLower.includes('vehicle') ||
              srcLower.includes('auto') ||
              srcLower.includes('bil') ||
              srcLower.includes('model') ||
              srcLower.includes('exterior')) {
            score += 15;
          }

          // Prefer URL patterns indicating high quality
          if (srcLower.includes('_large') || srcLower.includes('_big') ||
              srcLower.includes('1920') || srcLower.includes('1200') ||
              srcLower.includes('hero') || srcLower.includes('banner') ||
              srcLower.includes('original') || srcLower.includes('full')) {
            score += 20;
          }

          // Penalize URL patterns indicating low quality
          if (srcLower.includes('thumb') || srcLower.includes('small') ||
              srcLower.includes('icon') || srcLower.includes('logo') ||
              srcLower.includes('avatar') || srcLower.includes('_xs') ||
              srcLower.includes('_sm') || srcLower.includes('tiny')) {
            score -= 30;
          }

          // Prefer JPG/PNG/WEBP
          if (srcLower.match(/\.(jpg|jpeg|png|webp)(\?|$)/)) {
            score += 5;
          }

          // Prefer images in main content areas (hero sections, main content)
          if (img.closest('.hero, .banner, .main-image, .featured, [class*="hero"], [class*="banner"]')) {
            score += 25;
          } else if (img.closest('main, article, .content, section')) {
            score += 10;
          }

          // Penalize images in footer, nav, sidebar
          if (img.closest('footer, nav, aside, .sidebar, .footer, .nav')) {
            score -= 20;
          }

          images.push({ src, score, width });
        });

        // Sort by score descending
        images.sort((a, b) => b.score - a.score);

        console.log('Top 5 thumbnail candidates:', images.slice(0, 5).map(i => ({
          url: i.src.substring(0, 80),
          score: i.score,
          width: i.width
        })));

        return images.length > 0 ? images[0].src : undefined;
      } catch (e) {
        console.log('Error finding thumbnail:', e);
        return undefined;
      }
    }, url);

    console.log(`Thumbnail found: ${bestThumbnail || 'None'}`);

    // Find links in main content using the same logic as Cheerio version
    let foundLinks: { url: string; text: string }[] = [];
    if (fetchLinks) {
      console.log('Starting link extraction...');
      try {
        foundLinks = await page.evaluate((baseUrl: string) => {
          const links: { url: string; text: string }[] = [];
          
          // Look for links in main content areas only
          const contentAreas = ['main', 'article', '.content', '.main-content', '#main', '#content'];
          
          let searchArea = document.body;
          for (const area of contentAreas) {
            const areaElement = document.querySelector(area);
            if (areaElement) {
              searchArea = areaElement as HTMLElement;
              console.log(`Using search area: ${area}`);
              break;
            }
          }
          
          // Find all links in the search area
          searchArea.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            let linkText = link.textContent?.trim();
            
            // If no direct text, try to get text from child elements
            if (!linkText) {
              const childText = link.querySelector('span, div, .title, .label');
              linkText = childText?.textContent?.trim() || '';
            }
            
            // Skip if no href or text
            if (!href || !linkText || linkText.length < 3) {
              return;
            }
            
            // Handle internal links
            let fullUrl = href;
            let isRelevantLink = false;
            
            if (href.startsWith('/')) {
              try {
                const urlBase = new URL(baseUrl);
                fullUrl = `${urlBase.protocol}//${urlBase.host}${href}`;
                isRelevantLink = true;
              } catch (e) {
                return;
              }
            }
            // Check if it's an external brand link
            else if (href.startsWith('http')) {
              isRelevantLink = href.includes('suzuki') ||
                              href.includes('toyota') ||
                              href.includes('bmw') ||
                              href.includes('mercedes') ||
                              href.includes('audi') ||
                              href.includes('volvo') ||
                              href.includes('ford') ||
                              href.includes(new URL(baseUrl).hostname);
              fullUrl = href;
            }
            
            // Skip if not relevant
            if (!isRelevantLink) {
              return;
            }
            
            // Skip fragment links and home page
            if (href === '/' || href.startsWith('#')) {
              return;
            }
            
            // Skip common utility patterns
            const skipPatterns = [
              '/search', '/sok', '/login', '/logga-in', '/register', '/registrera',
              '/cart', '/varukorg', '/checkout', '/kassa', '/account', '/konto',
              '/profile', '/profil', '/settings', '/installningar', '/help', '/hjalp',
              '/support', '/contact', '/kontakt', '/about', '/om', '/privacy', '/integritet',
              '/terms', '/villkor', '/cookies', '/sitemap', '/rss', '/feed', '/api/',
              '.pdf', '.doc', '.zip', '/karriar', '/jobb', '/press', '/investor'
            ];
            
            const shouldSkip = skipPatterns.some(pattern => 
              href.toLowerCase().includes(pattern.toLowerCase())
            );
            if (shouldSkip) return;
            
            // Skip generic/low-quality link text
            const lowQualityPatterns = [
              /^(läs mer|read more|more|mer)$/i,
              /^(här|here)$/i,
              /^(klicka|click)$/i,
              /^(visa|show|view)$/i,
              /^(gå till|go to)$/i,
              /^(se|see)$/i,
              /^\d+$/,
              /^.{1,2}$/
            ];
            
            const isLowQuality = lowQualityPatterns.some(pattern => 
              pattern.test(linkText.trim())
            );
            if (isLowQuality) return;
            
            try {
              const linkUrlNormalized = new URL(fullUrl).href;
              const mainUrlNormalized = new URL(baseUrl).href;
              
              // Skip if same as main page or already added
              if (linkUrlNormalized !== mainUrlNormalized && 
                  !links.some(link => new URL(link.url).href === linkUrlNormalized)) {
                links.push({ url: fullUrl, text: linkText });
              }
            } catch (e) {
              // Skip invalid URLs
            }
          });
          
          return links.slice(0, 20);
        }, url);
        console.log(`Found ${foundLinks.length} links`);
      } catch (error) {
        console.error('Error during link extraction:', error);
        foundLinks = [];
      }
    }

    // Extract structured data
    const structuredData: ScrapedData[] = await page.evaluate((pageUrl: string) => {
      function extractPrice(text: string): string {
        const pricePatterns = [
          /\d{1,3}[\s,]*\d{3}[\s]*kr/i,
          /\d{1,3}[\s,]*\d{3}[\s]*SEK/i,
          /\d{1,3}[\s,]*\d{3}[\s]*:-/i,
          /kr[\s]*\d{1,3}[\s,]*\d{3}/i,
          /från[\s]*\d{1,3}[\s,]*\d{3}[\s]*kr/i,
          /endast[\s]*\d{1,3}[\s,]*\d{3}[\s]*kr/i
        ];
        
        for (const pattern of pricePatterns) {
          const match = text.match(pattern);
          if (match) return match[0];
        }
        return '';
      }

      function extractYear(text: string): string {
        const match = text.match(/20(0[5-9]|1[0-9]|2[0-4])/);
        return match ? match[0] : '';
      }

      function extractMileage(text: string): string {
        const patterns = [
          /\d{1,3}[\s,]*\d{3}[\s]*mil/i,
          /\d{1,3}[\s,]*\d{3}[\s]*km/i,
          /\d{1,6}[\s]*mil/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return match[0];
        }
        return '';
      }

      const containerSelectors = [
        '.puffBlock-puff', '.puffBlock', '.fullwidthText',
        '.product', '.item', '.listing', '.card', '.offer', '.vehicle', '.car',
        '[class*="product"]', '[class*="item"]', '[class*="listing"]', 
        '[class*="card"]', '[class*="offer"]', '[class*="vehicle"]', '[class*="car"]',
        'article', '.result', '.entry', '.headline_text', '.responsive_image'
      ];

      const items: ScrapedData[] = [];

      containerSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        Array.from(elements).slice(0, 20).forEach(element => {
          const text = element.textContent || '';
          const html = element.innerHTML;
          
          if (text.trim().length > 50) {
            // Extract image
            let imageUrl = '';
            const img = element.querySelector('img');
            if (img) {
              imageUrl = img.getAttribute('src') || 
                        img.getAttribute('data-src') || 
                        img.getAttribute('data-lazy-src') || '';
              
              if (imageUrl && imageUrl.startsWith('/')) {
                try {
                  const baseUrl = new URL(pageUrl);
                  imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
                } catch (e) {
                  imageUrl = '';
                }
              }
              
              if (imageUrl.includes('data:image/gif;base64') || 
                  imageUrl.includes('placeholder')) {
                imageUrl = '';
              }
            }

            // Check for images in source elements
            if (!imageUrl) {
              const source = element.querySelector('source');
              if (source) {
                let srcset = source.getAttribute('srcset');
                if (srcset) {
                  const firstUrl = srcset.split(',')[0].trim().split(/\s+/)[0];
                  if (firstUrl && firstUrl.startsWith('/')) {
                    try {
                      const baseUrl = new URL(pageUrl);
                      imageUrl = `${baseUrl.protocol}//${baseUrl.host}${firstUrl}`;
                    } catch (e) {
                      imageUrl = firstUrl;
                    }
                  } else {
                    imageUrl = firstUrl;
                  }
                }
              }
            }

            const titleElement = element.querySelector('h1, h2, h3, h4, h5, .title, [class*="title"], [class*="headline"]');
            const title = titleElement?.textContent?.trim() || text.split('\n')[0].trim().substring(0, 100);
            
            const linkElement = element.querySelector('a');
            let link = linkElement?.getAttribute('href') || '';
            
            // Fix relative links
            if (link && link.startsWith('/')) {
              try {
                const baseUrl = new URL(pageUrl);
                link = `${baseUrl.protocol}//${baseUrl.host}${link}`;
              } catch (e) {
                // Keep original link if URL parsing fails
              }
            }

            const item: ScrapedData = {
              title: title,
              rawHtml: html?.substring(0, 1000) || '',
              content: text.trim().substring(0, 500),
              image: imageUrl,
              link: link,
              price: extractPrice(text),
              year: extractYear(text),
              mileage: extractMileage(text)
            };

            if (item.title && item.title.length > 3) {
              items.push(item);
            }
          }
        });
      });

      // Remove duplicates
      return items.filter((item, index, self) => 
        index === self.findIndex(i => i.title === item.title && i.content === item.content)
      );
    }, url);

    // Fetch linked content
    let linkedContent: LinkedContent[] = [];
    if (fetchLinks && foundLinks.length > 0) {
      for (let i = 0; i < Math.min(foundLinks.length, 20); i++) {
        const link = foundLinks[i];
        try {
          const subPage = await browser.newPage();
          await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 300000 });

          // Extract content using same logic
          const subContent = await subPage.evaluate(() => {
            const contentSelectors = [
              'main', '#main', '.main-section', '[role="main"]', 'section.main-section',
              'article', '.content', '#content', '.page-content', 'body'
            ];

            let content = '';
            for (const selector of contentSelectors) {
              const element = document.querySelector(selector);
              if (element) {
                content = element.innerHTML;
                break;
              }
            }
            
            if (!content) {
              content = document.body.innerHTML;
            }
            
            return content;
          });

          // Clean the content using same cleaning function but with size limits
          const subHtml: string = await subPage.evaluate((html: string, baseUrl: string) => {
            // Apply same cleaning logic as main page but with limits
            if (!html) return '';
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Same aggressive cleaning but track content size
            const unwantedElements = tempDiv.querySelectorAll('script, style, noscript, link[rel="stylesheet"], svg, path, button[rel], button[disabled]');
            unwantedElements.forEach(el => el.remove());
            
            // Clean images
            const images = tempDiv.querySelectorAll('img');
            images.forEach(img => {
              let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
              const alt = img.getAttribute('alt') || '';
              
              // Handle Next.js images
              if (src && src.includes('/_next/image/') && src.includes('url=')) {
                const urlMatch = src.match(/url=([^&]+)/);
                if (urlMatch) {
                  src = decodeURIComponent(urlMatch[1]);
                }
              }
              
              // Handle srcset
              const srcset = img.getAttribute('srcset');
              if (srcset && srcset.includes('/_next/image/')) {
                const urls = srcset.split(',').map(s => {
                  const url = s.trim().split(/\s+/)[0];
                  if (url.includes('url=')) {
                    const match = url.match(/url=([^&]+)/);
                    return match ? decodeURIComponent(match[1]) : url;
                  }
                  return url;
                });
                if (!src && urls.length > 0) {
                  src = urls[urls.length - 1];
                }
              }
              
              if (src && src.startsWith('/')) {
                try {
                  const base = new URL(baseUrl);
                  src = `${base.protocol}//${base.host}${src}`;
                } catch (e) {}
              }
              
              Array.from(img.attributes).forEach(attr => img.removeAttribute(attr.name));
              
              if (src && !src.includes('data:image/gif;base64') && !src.includes('placeholder')) {
                img.setAttribute('src', src);
                img.setAttribute('alt', alt);
              } else {
                img.remove();
              }
            });
            
            // Clean links
            const links = tempDiv.querySelectorAll('a');
            links.forEach(link => {
              let href = link.getAttribute('href');
              
              if (href && href.startsWith('/')) {
                try {
                  const base = new URL(baseUrl);
                  href = `${base.protocol}//${base.host}${href}`;
                } catch (e) {}
              }
              
              Array.from(link.attributes).forEach(attr => link.removeAttribute(attr.name));
              
              if (href) {
                link.setAttribute('href', href);
              }
            });
            
            // Remove all attributes from other elements
            const allElements = tempDiv.querySelectorAll('*');
            allElements.forEach(elem => {
              if (elem.tagName === 'IMG' || elem.tagName === 'A') return;
              
              if (elem.tagName === 'INPUT') {
                const type = elem.getAttribute('type');
                const name = elem.getAttribute('name');
                const value = elem.getAttribute('value');
                const placeholder = elem.getAttribute('placeholder');
                const required = elem.getAttribute('required');
                
                Array.from(elem.attributes).forEach(attr => elem.removeAttribute(attr.name));
                
                if (type) elem.setAttribute('type', type);
                if (name) elem.setAttribute('name', name);
                if (value) elem.setAttribute('value', value);
                if (placeholder) elem.setAttribute('placeholder', placeholder);
                if (required !== null) elem.setAttribute('required', '');
              } else {
                Array.from(elem.attributes).forEach(attr => elem.removeAttribute(attr.name));
              }
            });
            
            // Remove empty elements
            for (let pass = 0; pass < 3; pass++) {
              const emptyElements = tempDiv.querySelectorAll('div, section, figure, article, ul, li, button, span, p');
              let removedCount = 0;
              
              emptyElements.forEach(elem => {
                const text = elem.textContent?.trim() || '';
                const hasImage = elem.querySelector('img');
                const hasInput = elem.querySelector('input, textarea, select');
                const hasLink = elem.querySelector('a[href]');
                
                if (!text && !hasImage && !hasInput && !hasLink && elem.children.length === 0) {
                  elem.remove();
                  removedCount++;
                }
              });
              
              if (removedCount === 0) break;
            }
            
            let result = tempDiv.innerHTML;
            result = result
              .replace(/\n\s*\n/g, '\n')
              .replace(/\s+/g, ' ')
              .replace(/>\s+</g, '><')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .trim();
            
            // IMPORTANT: Don't truncate linked content - let it be full length
            console.log(`Linked page cleaning completed, length: ${result.length}`);
            return result;
          }, subContent, link.url);

          const subTitle = await subPage.title();
          const subBody = await subPage.evaluate(() => 
            document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 5000) || ''
          );

          linkedContent.push({ 
            url: link.url, 
            title: subTitle, 
            content: subBody, 
            cleanedHtml: subHtml, 
            linkText: link.text, 
            success: true 
          });
          
          await subPage.close();
          await new Promise(resolve => setTimeout(resolve, 750));
        } catch (error: any) {
          linkedContent.push({ 
            url: link.url, 
            title: '', 
            content: '', 
            cleanedHtml: '', 
            linkText: link.text, 
            success: false, 
            error: error.message 
          });
        }
      }
    }

    await page.close();
    await browser.close();

    console.log('Building final result object...');
    
    const info: PageInfo = { 
      ...pageInfo, 
      contentLength: originalHtml.length, 
      cleanedContentLength: cleanedHtml.length, 
      linksFound: foundLinks.length, 
      linksFetched: linkedContent.filter(lc => lc.success).length 
    };

    // Build the final combined HTML with the EXACT same delimiters as Cheerio version
    let combinedHtml = '';
    
    // Add main page content with delimiter
    combinedHtml += '<!-- MAIN PAGE CONTENT START -->\n';
    combinedHtml += cleanedHtml;
    combinedHtml += '\n<!-- MAIN PAGE CONTENT END -->\n\n';

    // Add linked content with much clearer delimiters - EXACT same format as Cheerio
    if (linkedContent.length > 0) {
      const successfulLinks = linkedContent.filter(lc => lc.success);
      combinedHtml += `<!-- LINKED CONTENT START - ${successfulLinks.length} PAGES -->\n\n`;
      
      linkedContent.forEach((link, index) => {
        if (link.success) {
          combinedHtml += `<!-- LINKED PAGE ${index + 1} START -->\n`;
          combinedHtml += `<!-- LINK TEXT: ${link.linkText} -->\n`;
          combinedHtml += `<!-- URL: ${link.url} -->\n`;
          combinedHtml += `<!-- TITLE: ${link.title} -->\n`;
          combinedHtml += `<!-- CONTENT START -->\n`;
          combinedHtml += link.cleanedHtml;
          combinedHtml += `\n<!-- CONTENT END -->\n`;
          combinedHtml += `<!-- LINKED PAGE ${index + 1} END -->\n\n`;
        }
      });
      
      combinedHtml += `<!-- LINKED CONTENT END -->\n`;
    }

    console.log(`Combined HTML built with ${linkedContent.filter(lc => lc.success).length} linked pages`);

    // Extract PDFs from main page and all linked pages
    const allPdfLinks: PDFLink[] = [];
    const seenPdfUrls = new Set<string>();

    // Extract from main page
    const mainPagePdfs = extractPDFsFromHTML(cleanedHtml, url);
    mainPagePdfs.forEach(pdf => {
      if (!seenPdfUrls.has(pdf.url)) {
        seenPdfUrls.add(pdf.url);
        allPdfLinks.push(pdf);
      }
    });

    // Extract from linked pages
    linkedContent.forEach(link => {
      if (link.success && link.cleanedHtml) {
        const linkedPdfs = extractPDFsFromHTML(link.cleanedHtml, link.url);
        linkedPdfs.forEach(pdf => {
          if (!seenPdfUrls.has(pdf.url)) {
            seenPdfUrls.add(pdf.url);
            allPdfLinks.push(pdf);
          }
        });
      }
    });

    // Log PDF findings
    const pricelistPdfs = allPdfLinks.filter(p => p.type === 'pricelist');
    const brochurePdfs = allPdfLinks.filter(p => p.type === 'brochure');
    console.log(`📄 Found ${allPdfLinks.length} PDFs total: ${pricelistPdfs.length} pricelists, ${brochurePdfs.length} brochures`);
    if (pricelistPdfs.length > 0) {
      console.log('📄 Pricelist PDFs:');
      pricelistPdfs.forEach(pdf => console.log(`   - ${pdf.url}`));
    }

    const result: ScrapeResult = {
      success: true,
      url,
      pageInfo: info,
      cleanedHtml: combinedHtml, // Use the properly formatted combined HTML
      structuredData,
      linkedContent,
      pdfLinks: allPdfLinks,
      thumbnail: bestThumbnail
    };

    console.log('✅ Scraping completed successfully');
    console.log(`Final stats: Original: ${originalHtml.length}, Cleaned: ${cleanedHtml.length}, Links: ${foundLinks.length}, Structured items: ${structuredData.length}, PDFs: ${allPdfLinks.length}`);

    return result;

  } catch (error: any) {
    console.error('❌ Scraping failed with error:', error);
    
    // Ensure browser is closed even on error
    try {
      await page.close();
      await browser.close();
    } catch (cleanupError) {
      console.error('Error closing browser:', cleanupError);
    }
    
    const errorResult: ScrapeResult = {
      success: false,
      url,
      pageInfo: {
        title: '',
        description: '',
        url,
        scrapedAt: new Date().toISOString(),
        contentLength: 0,
        cleanedContentLength: 0,
        linksFound: 0,
        linksFetched: 0
      },
      cleanedHtml: '',
      structuredData: [],
      linkedContent: [],
      pdfLinks: [],
      error: error?.message || 'Failed to scrape website'
    };
    
    console.log('Returning error result:', errorResult.error);
    return errorResult;
  }
}