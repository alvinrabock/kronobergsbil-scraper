// Test PDF regex patterns against the actual HTML
const html = `<a href="https://dokument.peugeot.se/prislistor/personbilar/408.pdf"><span>Pris och produktfakta</span></a>`;

const pdfPatterns = [
    // Standard href links (case insensitive)
    /<a[^>]+href=["']([^"']*\.pdf[^"']*)["'][^>]*>/gi,
    // href with .PDF extension
    /<a[^>]+href=["']([^"']*\.PDF[^"']*)["'][^>]*>/g,
    // data-href attributes
    /<[^>]+data-href=["']([^"']*\.pdf[^"']*)["'][^>]*>/gi,
    // src attributes in embed/object tags
    /<(?:embed|object)[^>]+src=["']([^"']*\.pdf[^"']*)["'][^>]*>/gi,
    // Direct PDF URLs in text (common in JSON or data attributes)
    /(?:https?:\/\/[^\s"'<>]+\.pdf)/gi,
];

console.log('Testing PDF extraction patterns...');
console.log('HTML:', html);

pdfPatterns.forEach((pattern, index) => {
    const matches = html.match(pattern);
    if (matches) {
        console.log(`Pattern ${index + 1} found:`, matches);
        
        // Extract the actual URLs
        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(html)) !== null) {
            console.log(`  Extracted URL: ${match[1] || match[0]}`);
        }
    }
});