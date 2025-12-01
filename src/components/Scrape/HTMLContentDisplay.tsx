// components/HTMLContentDisplay.tsx
import { ScrapeResult, LinkedContent } from '@/lib/scraper';

interface CategorizedResult extends ScrapeResult {
  category?: string;
  contentType?: string;
  label?: string;
}

interface HTMLContentDisplayProps {
  scrapeResults: CategorizedResult[];
}

export function HTMLContentDisplay({ scrapeResults }: HTMLContentDisplayProps) {
  console.log('🔍 HTMLContentDisplay - Received scrapeResults:', scrapeResults);
  
  const successfulResults = scrapeResults.filter(r => r.success);
  console.log('🔍 HTMLContentDisplay - Successful results:', successfulResults);
  
  // Debug the HTML content
  successfulResults.forEach((result, index) => {
    console.log(`🔍 HTMLContentDisplay - Result ${index}:`, {
      url: result.url,
      hasCleanedHtml: !!result.cleanedHtml,
      cleanedHtmlLength: result.cleanedHtml?.length || 0,
      cleanedHtmlPreview: result.cleanedHtml?.substring(0, 100) || 'No HTML content'
    });
  });

  if (successfulResults.length === 0) {
    return (
      <div className="bg-gray-100 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">📄</div>
          <h3 className="text-lg font-medium mb-2">Inget HTML-innehåll</h3>
          <p>Skrapningen misslyckades eller producerade inget innehåll.</p>
        </div>
      </div>
    );
  }

  // Helper function to get successful linked content
  const getSuccessfulLinkedContent = (linkedContent: LinkedContent[]): LinkedContent[] => {
    return linkedContent.filter(lc => lc.success);
  };

  // Helper function to format linked content for display
  const formatLinkedContent = (linkedContent: LinkedContent[]): string => {
    const successfulLinks = getSuccessfulLinkedContent(linkedContent);
    
    if (successfulLinks.length === 0) {
      return '';
    }

    const linksContent = successfulLinks.map((lc, index) =>
      `\n<!-- Länk ${index + 1}: ${lc.linkText} -->\n<!-- URL: ${lc.url} -->\n<!-- Titel: ${lc.title} -->\n${lc.cleanedHtml}\n`
    ).join('');

    return `\n\n<!-- LÄNKAT INNEHÅLL (${successfulLinks.length} sidor) -->\n${linksContent}`;
  };


  // Generate comprehensive raw data view for all results
  const generateRawDataView = () => {
    let rawData = `<!-- ========================================== -->
<!-- COMPLETE SCRAPE SESSION RAW DATA -->
<!-- ========================================== -->
<!-- Total Successful Pages: ${successfulResults.length} -->
<!-- Generated: ${new Date().toISOString()} -->

`;

    successfulResults.forEach((result, index) => {
      const pageNumber = index + 1;
      const linkedContentFormatted = result.linkedContent 
        ? formatLinkedContent(result.linkedContent)
        : '';

      rawData += `<!-- ========================================== -->
<!-- PAGE ${pageNumber} OF ${successfulResults.length} -->
<!-- ========================================== -->
<!-- URL: ${result.url} -->
<!-- Category: ${result.category || 'Unknown'} -->
<!-- Content Type: ${result.contentType || 'Unknown'} -->
<!-- Label: ${result.label || 'No label'} -->
<!-- Page Title: ${result.pageInfo?.title || 'No title'} -->
<!-- Description: ${result.pageInfo?.description || 'No description'} -->
<!-- Scraped At: ${result.pageInfo?.scrapedAt || 'Unknown'} -->
<!-- Original Content Length: ${result.pageInfo?.contentLength || 0} characters -->
<!-- Cleaned Content Length: ${result.pageInfo?.cleanedContentLength || 0} characters -->
<!-- Links Found: ${result.pageInfo?.linksFound || 0} -->
<!-- Links Fetched: ${result.pageInfo?.linksFetched || 0} -->
<!-- Structured Data Items: ${result.structuredData?.length || 0} -->

<!-- ========================================== -->
<!-- CLEANED HTML CONTENT FOR PAGE ${pageNumber} -->
<!-- ========================================== -->

${result.cleanedHtml || '<!-- No HTML content available -->'}

${linkedContentFormatted}

<!-- ========================================== -->
<!-- END OF PAGE ${pageNumber} DATA -->
<!-- ========================================== -->

`;
    });

    rawData += `<!-- ========================================== -->
<!-- END OF COMPLETE SCRAPE SESSION -->
<!-- ========================================== -->`;

    return rawData;
  };

  // Always show comprehensive raw data view (no tabs)
  return (
    <div className="bg-gray-900 text-gray-100 h-full overflow-auto">
      <pre className="text-xs p-6 font-mono leading-relaxed select-text h-full break-words whitespace-pre-wrap">
        {generateRawDataView()}
      </pre>
    </div>
  );
}