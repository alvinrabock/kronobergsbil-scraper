// components/ResultsState.tsx - Updated with CMS integration
import { useState, useEffect } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { AIResultsDisplay } from './AIResultsDisplay';
import { HTMLContentDisplay } from './HTMLContentDisplay';
import { CMSPushPanel } from './CMSPushPanel';
import { ScrapeResult } from '@/lib/scraper';
// EnhancedProcessedResult type is no longer needed since we use any[] for aiResults

// PDF Processing Log interface
interface PDFProcessingLog {
    timestamp: string;
    pdfUrl: string;
    success: boolean;
    method: string;
    pageCount?: number;
    characterCount: number;
    processingTimeMs: number;
    textPreview?: string;
    error?: string;
}

interface UrlData {
    url: string;
    category: string;
    contentType: string;
    label?: string;
}

interface CategorizedResult extends ScrapeResult {
    category?: string;
    contentType?: string;
    label?: string;
}

interface ArchiveEntry {
    id: string;
    timestamp: Date;
    urls: UrlData[];
    scrapeResults: CategorizedResult[];
    aiResults: any[];
    status: 'completed' | 'failed' | 'processing';
    error?: string;
}

interface ResultsStateProps {
    currentEntry: ArchiveEntry;
    error: string | null;
    isAiProcessing: boolean;
    onNewSearch: () => void;
    onViewArchive: () => void;
    onProcessWithAI: (results: CategorizedResult[], entryId: string) => Promise<void>;
}

type ViewType = 'html' | 'ai' | 'payload';

export function ResultsState({
    currentEntry,
    error,
    isAiProcessing,
    onProcessWithAI
}: ResultsStateProps) {
    // Set default active view based on AI results availability
    const [activeView, setActiveView] = useState<ViewType>('html');

    // PDF processing logs state
    const [pdfLogs, setPdfLogs] = useState<PDFProcessingLog[]>([]);
    const [pdfLogsExpanded, setPdfLogsExpanded] = useState(false);
    const [pdfLogsLoading, setPdfLogsLoading] = useState(false);

    // Function to fetch PDF logs
    const fetchPdfLogs = async () => {
        setPdfLogsLoading(true);
        try {
            const response = await fetch('/api/pdf-logs');
            if (response.ok) {
                const data = await response.json();
                setPdfLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch PDF logs:', error);
        } finally {
            setPdfLogsLoading(false);
        }
    };

    // Fetch PDF logs when component mounts or entry changes
    useEffect(() => {
        fetchPdfLogs();
    }, [currentEntry.id]);

    // Refetch PDF logs when AI processing completes
    useEffect(() => {
        if (!isAiProcessing && currentEntry.aiResults.length > 0) {
            // Small delay to ensure logs are written
            const timer = setTimeout(() => {
                fetchPdfLogs();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isAiProcessing, currentEntry.aiResults.length]);

    // Helper function to get successful scrape results
    const getSuccessfulScrapeResults = (): CategorizedResult[] => {
        return currentEntry.scrapeResults.filter(r => r.success);
    };

    // Helper function to get successful AI results
    const getSuccessfulAiResults = (): any[] => {
        return currentEntry.aiResults.filter(r => r.success);
    };

    // Helper function to calculate total tokens and costs
    const getTokenSummary = () => {
        const aiResults = getSuccessfulAiResults();
        let totalTokens = 0;
        let totalCost = 0;
        let totalProcessingTime = 0;
        let apiCalls = 0;
        const providerBreakdown = { claude: 0, perplexity: 0 };

        // Debug logging
        console.log('🔍 Token Summary Debug - AI Results:', aiResults);
        console.log('🔍 Token Summary Debug - AI Results length:', aiResults.length);
        console.log('🔍 Token Summary Debug - Full currentEntry.aiResults:', currentEntry.aiResults);

        aiResults.forEach((result, index) => {
            console.log(`🔍 Processing AI result ${index}:`, {
                token_usage: result.token_usage,
                total_estimated_cost_usd: result.total_estimated_cost_usd,
                api_calls: result.api_calls,
                processing_time_ms: result.processing_time_ms
            });

            // Handle token usage from various data structures
            if (result.token_usage) {
                totalTokens += result.token_usage.total_tokens || 0;
                let costFromTokenUsage = result.token_usage.estimated_cost_usd || 0;
                
                // If no cost is provided but we have token counts, calculate it
                if (costFromTokenUsage === 0 && result.token_usage.total_tokens > 0) {
                    const inputTokens = result.token_usage.prompt_tokens || result.token_usage.inputTokens || 0;
                    const outputTokens = result.token_usage.completion_tokens || result.token_usage.outputTokens || 0;
                    const model = result.token_usage.model_used || 'claude-sonnet-4-5';
                    const provider = result.token_usage.api_provider || 'claude';

                    // Calculate cost manually using the pricing structure
                    if (provider === 'claude' || model.includes('claude')) {
                        if (model.includes('claude-sonnet')) {
                            costFromTokenUsage = (inputTokens * 3.0 / 1000000) + (outputTokens * 15.0 / 1000000);
                        } else if (model.includes('claude-haiku')) {
                            costFromTokenUsage = (inputTokens * 0.8 / 1000000) + (outputTokens * 4.0 / 1000000);
                        } else if (model.includes('claude-opus')) {
                            costFromTokenUsage = (inputTokens * 15.0 / 1000000) + (outputTokens * 75.0 / 1000000);
                        }
                    } else if (provider === 'perplexity') {
                        costFromTokenUsage = (inputTokens * 1.0 / 1000000) + (outputTokens * 3.0 / 1000000);
                    }

                    console.log(`💰 Calculated missing cost for ${model} (${provider}): $${costFromTokenUsage.toFixed(6)}`);
                }

                totalCost += costFromTokenUsage;

                if (result.token_usage.api_provider) {
                    providerBreakdown[result.token_usage.api_provider as keyof typeof providerBreakdown] += costFromTokenUsage;
                } else {
                    // Default to claude if no provider specified (Claude is primary)
                    providerBreakdown.claude += costFromTokenUsage;
                }
            }
            
            // Handle direct cost field
            if (result.total_estimated_cost_usd && result.total_estimated_cost_usd > 0) {
                totalCost += result.total_estimated_cost_usd;
                // If we don't have provider info, assume Claude (primary provider)
                if (!result.token_usage?.api_provider) {
                    providerBreakdown.claude += result.total_estimated_cost_usd;
                }
            }
            
            // Handle processing time
            if (result.processing_time_ms) {
                totalProcessingTime += result.processing_time_ms;
            }
            
            // Handle API calls (including Perplexity fact-checking)
            if (result.api_calls?.length) {
                apiCalls += result.api_calls.length;
                result.api_calls.forEach((call: any) => {
                    totalProcessingTime += call.processing_time_ms || 0;
                    if (call.token_usage) {
                        totalTokens += call.token_usage.total_tokens || 0;
                        let callCost = call.token_usage.estimated_cost_usd || 0;
                        
                        // Calculate cost if missing but we have token counts
                        if (callCost === 0 && call.token_usage.total_tokens > 0) {
                            const promptTokens = call.token_usage.prompt_tokens || 0;
                            const completionTokens = call.token_usage.completion_tokens || 0;
                            const model = call.token_usage.model_used || 'sonar';
                            const provider = call.token_usage.api_provider || 'perplexity';
                            
                            if (provider === 'perplexity') {
                                callCost = (promptTokens * 1.0 / 1000000) + (completionTokens * 3.0 / 1000000);
                                console.log(`💰 Calculated missing Perplexity cost: $${callCost.toFixed(6)}`);
                            } else if (provider === 'claude' || model.includes('claude')) {
                                if (model.includes('claude-sonnet')) {
                                    callCost = (promptTokens * 3.0 / 1000000) + (completionTokens * 15.0 / 1000000);
                                } else if (model.includes('claude-haiku')) {
                                    callCost = (promptTokens * 0.8 / 1000000) + (completionTokens * 4.0 / 1000000);
                                } else if (model.includes('claude-opus')) {
                                    callCost = (promptTokens * 15.0 / 1000000) + (completionTokens * 75.0 / 1000000);
                                }
                                console.log(`💰 Calculated missing Claude API call cost: $${callCost.toFixed(6)}`);
                            }
                        }
                        
                        totalCost += callCost;
                        const provider = call.token_usage.api_provider || 'perplexity';
                        providerBreakdown[provider as keyof typeof providerBreakdown] += callCost;
                    }
                });
            }
        });

        const summary = {
            totalTokens,
            totalCost,
            totalProcessingTime,
            apiCalls,
            providerBreakdown
        };

        console.log('💰 Final Token Summary:', summary);
        console.log('💰 Total Cost USD:', totalCost);
        console.log('💰 Provider Breakdown:', providerBreakdown);
        console.log('💰 Formatted Total Cost:', formatCost(totalCost));
        return summary;
    };

    // Helper function to format cost in both USD and SEK
    const formatCost = (costUsd: number) => {
        if (costUsd === 0) return '$0.000 (0 kr)';
        
        // Current USD to SEK exchange rate (approximately 10.5 as of 2024)
        const usdToSek = 10.8; // Update this periodically
        const costSek = costUsd * usdToSek;
        
        if (costUsd < 0.001) {
            return `$${(costUsd * 1000).toFixed(3)}k (${(costSek * 1000).toFixed(2)}ö)`; // Show in thousandths/öre
        }
        
        if (costSek < 1) {
            return `$${costUsd.toFixed(4)} (${(costSek * 100).toFixed(0)}ö)`; // Show in öre
        }
        
        return `$${costUsd.toFixed(4)} (${costSek.toFixed(2)} kr)`;
    };

    // Helper function to format processing time
    const formatProcessingTime = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    // Helper function to get status display text
    const getStatusText = (status: 'completed' | 'failed' | 'processing'): string => {
        switch (status) {
            case 'completed': return 'Slutförd';
            case 'failed': return 'Misslyckad';
            case 'processing': return 'Pågående';
            default: return 'Okänd';
        }
    };

    // Helper function to get status color
    const getStatusColor = (status: 'completed' | 'failed' | 'processing'): string => {
        switch (status) {
            case 'completed': return 'text-green-600';
            case 'failed': return 'text-red-600';
            case 'processing': return 'text-blue-600';
            default: return 'text-gray-600';
        }
    };

    // Helper function to get result status styling
    const getResultStatusStyling = (result?: CategorizedResult) => {
        if (result?.success) {
            return {
                containerClass: 'bg-green-50 border-green-200',
                indicatorClass: 'bg-green-500'
            };
        } else if (result) {
            return {
                containerClass: 'bg-red-50 border-red-200',
                indicatorClass: 'bg-red-500'
            };
        } else {
            return {
                containerClass: 'bg-gray-50 border-gray-200',
                indicatorClass: 'bg-gray-300'
            };
        }
    };

    // Helper function to handle AI processing
    const handleProcessWithAI = async (): Promise<void> => {
        const successfulResults = getSuccessfulScrapeResults();
        if (successfulResults.length > 0) {
            await onProcessWithAI(successfulResults, currentEntry.id);
        }
    };


    // Helper function to copy AI results as JSON (new schema with variants)
    const handleCopyAiJson = async (): Promise<void> => {
        try {
            const successfulAiResults = getSuccessfulAiResults();
            // Always use the converted data (with new schema - variants instead of vehicle_models)
            const jsonData = JSON.stringify({
                campaigns: successfulAiResults.flatMap(r => r.campaigns || []),
                cars: successfulAiResults.flatMap(r => r.cars || []),
                transport_cars: successfulAiResults.flatMap(r => r.transport_cars || [])
            }, null, 2);
            await navigator.clipboard.writeText(jsonData);
        } catch (error) {
            console.error('Failed to copy JSON to clipboard:', error);
        }
    };

    // Update active view when AI results become available
    useEffect(() => {
        if (currentEntry.aiResults && currentEntry.aiResults.length > 0 && !isAiProcessing) {
            setActiveView('ai'); // Automatically switch to AI tab when results are ready
        }
    }, [currentEntry.aiResults, isAiProcessing]);

    // Also set AI as default when component mounts if AI results already exist
    useEffect(() => {
        if (currentEntry.aiResults && currentEntry.aiResults.length > 0) {
            setActiveView('ai');
        }
    }, [currentEntry.aiResults]);

    // Check if we have processable AI results for Payload CMS
    const hasPayloadCMSData = () => {
        const successfulAiResults = getSuccessfulAiResults();
        return successfulAiResults.some(result => 
            (result.campaigns && result.campaigns.length > 0) ||
            (result.cars && result.cars.length > 0) ||
            (result.transport_cars && result.transport_cars.length > 0)
        );
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col gap-6">
                <div>
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                        <div className="space-y-6">
                            {/* Entry Info */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                    Skrapning #{currentEntry.id.slice(-6)}
                                </h3>
                                <div className="grid grid-cols-3 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-gray-600">Status:</span>
                                        <span className={`font-medium ${getStatusColor(currentEntry.status)}`}>
                                            {getStatusText(currentEntry.status)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-gray-600">Tid:</span>
                                        <span>{new Intl.DateTimeFormat('sv-SE', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }).format(currentEntry.timestamp)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-gray-600">Webbsidor:</span>
                                        <span>{getSuccessfulScrapeResults().length}/{currentEntry.urls.length}</span>
                                    </div>
                                </div>
                                
                                {/* Token Usage & Cost Information */}
                                {(() => {
                                    console.log('🔍 Current entry AI results count:', currentEntry.aiResults.length);
                                    console.log('🔍 Current entry AI results:', currentEntry.aiResults);
                                    
                                    if (currentEntry.aiResults.length === 0) {
                                        return null;
                                    }
                                    
                                    const tokenSummary = getTokenSummary();
                                    console.log('🔍 Should show token section?', tokenSummary.totalTokens > 0 || tokenSummary.totalCost > 0);
                                    
                                    return tokenSummary.totalTokens > 0 || tokenSummary.totalCost > 0 ? (
                                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                            <h4 className="font-medium text-green-900 mb-3 flex items-center">
                                                <span className="text-lg mr-2">💰</span>
                                                AI Processing Costs & Performance
                                            </h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-gray-600">Total Tokens:</span>
                                                    <span className="font-medium text-gray-900">
                                                        {tokenSummary.totalTokens.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-600">Total Cost:</span>
                                                    <span className="font-medium text-green-700">
                                                        {formatCost(tokenSummary.totalCost)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-600">API Calls:</span>
                                                    <span className="font-medium text-gray-900">
                                                        {tokenSummary.apiCalls || currentEntry.aiResults.length}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-600">Processing Time:</span>
                                                    <span className="font-medium text-gray-900">
                                                        {formatProcessingTime(tokenSummary.totalProcessingTime)}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Provider Breakdown - only show if multiple providers used */}
                                            {tokenSummary.providerBreakdown.claude > 0 && tokenSummary.providerBreakdown.perplexity > 0 && (
                                                <div className="mt-3 pt-3 border-t border-green-200">
                                                    <span className="text-xs text-gray-600 mb-2 block">Cost by Provider:</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        <span className="inline-flex items-center px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                                                            <span className="mr-1">🧠</span>
                                                            Claude: {formatCost(tokenSummary.providerBreakdown.claude)}
                                                        </span>
                                                        <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                                            <span className="mr-1">🔍</span>
                                                            Perplexity: {formatCost(tokenSummary.providerBreakdown.perplexity)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : null;
                                })()}
                            </div>

                            {/* URL List */}
                            <div>
                                <h4 className="font-medium text-gray-900 mb-3">Skrapade webbsidor</h4>
                                <div className="space-y-2">
                                    {currentEntry.urls.map((urlData, idx) => {
                                        const result = currentEntry.scrapeResults[idx];
                                        const styling = getResultStatusStyling(result);

                                        return (
                                            <div key={idx} className={`p-3 rounded-lg border ${styling.containerClass}`}>
                                                <div className="flex items-start space-x-2">
                                                    <span className={`w-2 h-2 rounded-full mt-2 ${styling.indicatorClass}`}></span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">
                                                            {urlData.label || result?.pageInfo?.title || `Webbsida ${idx + 1}`}
                                                        </p>
                                                        <p className="text-xs text-gray-600 truncate">
                                                            {(() => {
                                                              try {
                                                                return new URL(urlData.url).hostname
                                                              } catch {
                                                                return urlData.url || 'Invalid URL'
                                                              }
                                                            })()}
                                                        </p>
                                                        {urlData.category && (
                                                            <span className="inline-block mt-1 px-2 py-1 bg-white border rounded text-xs">
                                                                {urlData.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Error Display */}
                            {(error || currentEntry.error) && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                    <h4 className="font-medium text-red-900 mb-2">Fel uppstod</h4>
                                    <p className="text-sm text-red-700">{error || currentEntry.error}</p>
                                </div>
                            )}

                            {/* Fact-Check Summary */}
                            {currentEntry.aiResults.some(r => r.fact_check) && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                                        Faktakontroll-resultat
                                    </h4>
                                    {currentEntry.aiResults
                                        .filter(r => r.fact_check)
                                        .map((result, idx) => (
                                            <div key={idx} className="text-sm text-blue-700 mb-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium">
                                                        {(() => {
                                                          try {
                                                            return new URL(result.source_url || '').pathname
                                                          } catch {
                                                            return result.source_url || 'Unknown source'
                                                          }
                                                        })()}
                                                    </span>
                                                    <div className="flex items-center space-x-2">
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            result.fact_check!.overall_accuracy >= 80
                                                                ? 'bg-green-100 text-green-800'
                                                                : result.fact_check!.overall_accuracy >= 60
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {result.fact_check!.overall_accuracy.toFixed(1)}% noggrannhet
                                                        </span>
                                                        {result.fact_check!.critical_issues > 0 && (
                                                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                                                                {result.fact_check!.critical_issues} kritiska problem
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}

                            {/* PDF Processing Logs - Always show */}
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <button
                                        onClick={() => setPdfLogsExpanded(!pdfLogsExpanded)}
                                        className="flex-1 flex justify-between items-center"
                                    >
                                        <h4 className="font-medium text-amber-900 flex items-center">
                                            <span className="mr-2">📄</span>
                                            PDF OCR Loggar ({pdfLogs.length})
                                        </h4>
                                        <div className="flex items-center space-x-2">
                                            {pdfLogs.length > 0 ? (
                                                <span className="text-xs text-amber-700">
                                                    {pdfLogs.filter(l => l.success).length} lyckade, {pdfLogs.filter(l => !l.success).length} misslyckade
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-500">Inga PDF:er bearbetade</span>
                                            )}
                                            <span className={`transform transition-transform ${pdfLogsExpanded ? 'rotate-180' : ''}`}>
                                                ▼
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            fetchPdfLogs();
                                        }}
                                        className="ml-2 p-1.5 text-amber-700 hover:bg-amber-100 rounded transition-colors"
                                        title="Uppdatera loggar"
                                    >
                                        <svg className={`w-4 h-4 ${pdfLogsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                {pdfLogsExpanded && (
                                    <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                                        {pdfLogsLoading ? (
                                            <div className="text-center py-4 text-amber-700">
                                                <LoadingSpinner size="sm" />
                                                <span className="ml-2">Laddar loggar...</span>
                                            </div>
                                        ) : pdfLogs.length === 0 ? (
                                            <div className="text-center py-4 text-gray-500 text-sm">
                                                <p>Inga PDF:er har bearbetats ännu.</p>
                                                <p className="text-xs mt-1">PDF-loggar visas här efter att du kört &quot;Analysera med AI&quot; på en sida med PDF-länkar.</p>
                                            </div>
                                        ) : (
                                            pdfLogs.map((log, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`p-3 rounded-lg border ${
                                                        log.success
                                                            ? 'bg-green-50 border-green-200'
                                                            : 'bg-red-50 border-red-200'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex items-center space-x-2">
                                                            <span>{log.success ? '✅' : '❌'}</span>
                                                            <span className="text-xs font-mono text-gray-600">
                                                                {new Date(log.timestamp).toLocaleString('sv-SE')}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                                                            {log.method}
                                                        </span>
                                                    </div>

                                                    <p className="text-xs text-gray-700 truncate mb-2" title={log.pdfUrl}>
                                                        {log.pdfUrl}
                                                    </p>

                                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                                        {log.pageCount && (
                                                            <div className="flex flex-col">
                                                                <span className="text-gray-500">Sidor</span>
                                                                <span className="font-medium">{log.pageCount}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-500">Tecken</span>
                                                            <span className="font-medium">{log.characterCount.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-500">Tid</span>
                                                            <span className="font-medium">{log.processingTimeMs}ms</span>
                                                        </div>
                                                    </div>

                                                    {log.textPreview && (
                                                        <div className="mt-2 p-2 bg-white rounded border text-xs text-gray-600 max-h-20 overflow-y-auto">
                                                            <span className="text-gray-400">Förhandsvisning: </span>
                                                            {log.textPreview.substring(0, 200)}...
                                                        </div>
                                                    )}

                                                    {log.error && (
                                                        <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                                                            <span className="font-medium">Fel: </span>
                                                            {log.error}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Content - Results */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[600px] flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="border-b border-gray-200 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-4">
                                    <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                        <span className="mr-2">🔍</span>
                                        Innehållsanalys
                                    </h3>

                                    {/* View Toggle */}
                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                        <button
                                            onClick={() => setActiveView('html')}
                                            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'html'
                                                ? 'bg-white shadow-sm text-gray-900'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                        >
                                            <span>📝</span>
                                            <span>Rå HTML</span>
                                        </button>
                                        <button
                                            onClick={() => setActiveView('ai')}
                                            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'ai'
                                                ? 'bg-white shadow-sm text-gray-900'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                            disabled={currentEntry.aiResults.length === 0}
                                        >
                                            <span>🤖</span>
                                            <span>AI-analys</span>
                                            {currentEntry.aiResults.length === 0 && (
                                                <span className="text-xs text-gray-400">(ej tillgänglig)</span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setActiveView('payload')}
                                            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'payload'
                                                ? 'bg-white shadow-sm text-gray-900'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                            disabled={!hasPayloadCMSData()}
                                        >
                                            <span>🚀</span>
                                            <span>Skicka till CMS</span>
                                            {!hasPayloadCMSData() && (
                                                <span className="text-xs text-gray-400">(ej tillgänglig)</span>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {activeView === 'html' && currentEntry.scrapeResults.length > 0 && (
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={handleProcessWithAI}
                                            disabled={isAiProcessing || getSuccessfulScrapeResults().length === 0}
                                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isAiProcessing || getSuccessfulScrapeResults().length === 0
                                                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                                                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg'
                                                }`}
                                        >
                                            {isAiProcessing ? (
                                                <>
                                                    <LoadingSpinner size="sm" className="border-gray-400 border-t-gray-600" />
                                                    <span>Analyserar...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>🤖</span>
                                                    <span>Analysera med AI</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {activeView === 'ai' && currentEntry.aiResults.length > 0 && (
                                    <button
                                        onClick={handleCopyAiJson}
                                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                    >
                                        <span>📋</span>
                                        <span>Kopiera JSON</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden">
                            {activeView === 'html' ? (
                                <HTMLContentDisplay scrapeResults={currentEntry.scrapeResults} />
                            ) : activeView === 'ai' ? (
                                <AIResultsDisplay results={currentEntry.aiResults} isProcessing={isAiProcessing} />
                            ) : (
                                <CMSPushPanel aiResults={currentEntry.aiResults} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}