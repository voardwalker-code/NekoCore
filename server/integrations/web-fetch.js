// ============================================================
// REM System — Web Fetch Module
//
// Fetches web pages and extracts readable text content.
// Supports URL content fetching and DuckDuckGo web search.
// Zero external dependencies — pure Node.js https/http modules.
// ============================================================

const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_BODY_BYTES = 512 * 1024; // 512KB max page fetch
const FETCH_TIMEOUT = 15000;       // 15s timeout
const MAX_REDIRECTS = 5;
const MAX_TEXT_LENGTH = 8000;      // Max extracted text chars to return
const SEARCH_MAX_RESULTS = 5;

// ── Fetch a URL and return raw body ─────────────────────────
function fetchUrl(urlStr, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    // Only allow http/https
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
    }

    // Block private/internal IPs to prevent SSRF
    const hostname = parsed.hostname.toLowerCase();
    if (isPrivateHost(hostname)) {
      return reject(new Error('Fetching private/internal addresses is not allowed'));
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(urlStr, {
      headers: {
        'User-Agent': 'MemoryArchitect/1.0 (Web Fetcher)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: FETCH_TIMEOUT
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          return reject(new Error('Too many redirects'));
        }
        const redirectUrl = new URL(res.headers.location, urlStr).href;
        res.resume(); // Consume response to free memory
        return fetchUrl(redirectUrl, redirectsLeft - 1).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${urlStr}`));
      }

      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          res.destroy();
          reject(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          contentType: res.headers['content-type'] || '',
          url: urlStr
        });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

// ── SSRF protection: block private/internal hosts ───────────
function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  // Block common private IP ranges
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0 || a === 127) return true;
  }
  return false;
}

// ── Extract readable text from HTML ─────────────────────────
function extractTextFromHtml(html) {
  // Remove script, style, nav, footer, header tags and their contents
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const metaDesc = metaMatch ? decodeHtmlEntities(metaMatch[1].trim()) : '';

  // Convert common block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, '\n')
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, ' ')        // Collapse horizontal whitespace
    .replace(/\n\s*\n/g, '\n\n')    // Collapse multiple blank lines
    .replace(/^\s+|\s+$/gm, '')     // Trim each line
    .trim();

  // Truncate to reasonable length
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... content truncated ...]';
  }

  let result = '';
  if (title) result += `Title: ${title}\n`;
  if (metaDesc) result += `Description: ${metaDesc}\n`;
  if (result) result += '\n';
  result += text;

  return result;
}

// ── Decode common HTML entities ─────────────────────────────
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ── Fetch a URL and extract readable text ───────────────────
async function fetchAndExtract(urlStr) {
  const result = await fetchUrl(urlStr);
  const ct = result.contentType.toLowerCase();

  if (ct.includes('application/json')) {
    // Return formatted JSON
    try {
      const parsed = JSON.parse(result.body);
      const formatted = JSON.stringify(parsed, null, 2);
      return {
        url: result.url,
        text: formatted.slice(0, MAX_TEXT_LENGTH),
        type: 'json'
      };
    } catch {
      return { url: result.url, text: result.body.slice(0, MAX_TEXT_LENGTH), type: 'text' };
    }
  }

  if (ct.includes('text/plain')) {
    return {
      url: result.url,
      text: result.body.slice(0, MAX_TEXT_LENGTH),
      type: 'text'
    };
  }

  // Default: treat as HTML
  return {
    url: result.url,
    text: extractTextFromHtml(result.body),
    type: 'html'
  };
}

// ── DuckDuckGo HTML search (no API key needed) ──────────────
async function webSearch(query) {
  const html = await ddgPost(query);

  // Extract search results from DDG HTML
  const results = [];
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links = [];
  const snippets = [];

  let match;
  while ((match = resultPattern.exec(html)) !== null && links.length < SEARCH_MAX_RESULTS) {
    let href = match[1];
    // DDG wraps URLs in a redirect — extract the actual URL
    const uddgMatch = href.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      href = decodeURIComponent(uddgMatch[1]);
    }
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    links.push({ href, title });
  }

  while ((match = snippetPattern.exec(html)) !== null && snippets.length < SEARCH_MAX_RESULTS) {
    snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].href,
      snippet: snippets[i] || ''
    });
  }

  return results;
}

// ── DDG POST request (bypasses bot challenge on GET) ────────
function ddgPost(query) {
  return new Promise((resolve, reject) => {
    const postData = `q=${encodeURIComponent(query)}`;
    const req = https.request({
      hostname: 'html.duckduckgo.com',
      path: '/html/',
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://html.duckduckgo.com/'
      },
      timeout: FETCH_TIMEOUT
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`DDG search returned HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) { res.destroy(); return reject(new Error('DDG response too large')); }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('DDG search timed out')); });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Extract URLs from text ──────────────────────────────────
function extractUrls(text) {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlPattern) || [];
  // Deduplicate and clean trailing punctuation
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)]+$/, '')))];
}

// ── Process a message: detect URLs, fetch content, format context ──
async function processWebContent(text) {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;

  const results = [];
  for (const url of urls.slice(0, 3)) { // Max 3 URLs per message
    try {
      console.log(`  🌐 Fetching: ${url}`);
      const content = await fetchAndExtract(url);
      results.push(content);
      console.log(`  ✓ Fetched ${url} (${content.text.length} chars, ${content.type})`);
    } catch (err) {
      console.warn(`  ⚠ Failed to fetch ${url}: ${err.message}`);
      results.push({ url, text: `[Failed to fetch: ${err.message}]`, type: 'error' });
    }
  }

  if (results.length === 0) return null;

  // Format into a context block
  let context = '\n\n[WEB CONTENT]\n';
  for (const r of results) {
    context += `\n--- ${r.url} ---\n${r.text}\n`;
  }
  context += '\n[/WEB CONTENT]\n';

  return context;
}

// ── Format search results as context ────────────────────────
function formatSearchResults(results, query) {
  if (!results || results.length === 0) {
    return `[WEB SEARCH: "${query}"]\nNo results found.\n[/WEB SEARCH]`;
  }

  let text = `[WEB SEARCH: "${query}"]\n`;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    text += `\n${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}\n`;
  }
  text += `\n[/WEB SEARCH]`;
  return text;
}

module.exports = {
  fetchUrl,
  fetchAndExtract,
  webSearch,
  extractUrls,
  processWebContent,
  formatSearchResults
};
