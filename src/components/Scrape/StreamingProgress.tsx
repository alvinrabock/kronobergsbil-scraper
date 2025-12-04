import { useState, useEffect, useRef } from 'react';

interface ProgressUpdate {
  step: string;
  message: string;
  progress: number;
  sessionId?: string;
  success?: boolean;
  error?: string;
}

interface StreamingProgressProps {
  scrapingParams: {
    url: string;
    category: string;
    depth: number;
    brand?: string;
    autoPushToCMS?: boolean;
  };
  onComplete: (sessionId: string) => void;
  onError: (error: string) => void;
}

const stepIcons: Record<string, string> = {
  initializing: '🔧',
  session_created: '📋',
  scraping_start: '🌐',
  scraping_complete: '✅',
  saving_content: '💾',
  pdf_extraction_start: '📄',
  pdf_custom_extractor: '🔬',
  pdf_standard_ocr: '📝',
  pdf_claude_extraction: '🔮',
  pdf_extraction_complete: '📑',
  pdf_fact_check_start: '🔍',
  pdf_fact_check_complete: '✔️',
  pdf_fact_check_failed: '⚠️',
  pdf_fact_check_error: '⚠️',
  ai_processing_start: '🤖',
  ai_batch_processing: '🔄',
  fact_checking_complete: '✔️',
  ai_processing_complete: '🧠',
  saving_ai_results: '📊',
  data_saved: '🗄️',
  cms_push_start: '📤',
  cms_push_complete: '✅',
  complete: '🎉',
  error: '❌'
};

const stepNames: Record<string, string> = {
  initializing: 'Initializing',
  session_created: 'Session Created',
  scraping_start: 'Starting Scrape',
  scraping_complete: 'Scraping Complete',
  saving_content: 'Saving Content',
  pdf_extraction_start: 'PDF Extraction',
  pdf_custom_extractor: 'Custom Extractor (Full Data)',
  pdf_standard_ocr: 'PDF Text Extraction (OCR)',
  pdf_claude_extraction: 'Claude PDF Extraction',
  pdf_extraction_complete: 'PDF Processing Complete',
  pdf_fact_check_start: 'Perplexity Fact-Check',
  pdf_fact_check_complete: 'Fact-Check Complete',
  pdf_fact_check_failed: 'Fact-Check Warning',
  pdf_fact_check_error: 'Fact-Check Error',
  ai_processing_start: 'AI Analysis',
  ai_batch_processing: 'Batch Processing',
  fact_checking_complete: 'Fact Checking',
  ai_processing_complete: 'AI Complete',
  saving_ai_results: 'Saving AI Results',
  data_saved: 'Data Saved',
  cms_push_start: 'Pushing to CMS',
  cms_push_complete: 'CMS Updated',
  complete: 'Complete',
  error: 'Error'
};

export function StreamingProgress({ scrapingParams, onComplete, onError }: StreamingProgressProps) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPushingToCMS, setIsPushingToCMS] = useState(false);
  const [cmsPushResult, setCmsPushResult] = useState<{success: boolean; created: number; updated: number; failed: number} | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasStartedRef = useRef(false); // Prevent double-execution in React Strict Mode

  // Function to push data to CMS
  const pushToCMS = async (sessionId: string) => {
    setIsPushingToCMS(true);
    setUpdates(prev => [...prev, {
      step: 'cms_push_start',
      message: 'Pushing data to Payload CMS...',
      progress: 97
    }]);
    setCurrentStep('cms_push_start');

    try {
      // First fetch the session data
      const sessionResponse = await fetch(`/api/scrape/${sessionId}`);
      const sessionData = await sessionResponse.json();

      if (!sessionData.success || !sessionData.vehicles || sessionData.vehicles.length === 0) {
        throw new Error('No vehicles found to push to CMS');
      }

      // Push to CMS via the import API
      const pushResponse = await fetch('/api/import/fordon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicles: sessionData.vehicles.map((v: any) => ({
            name: v.name,
            brand: v.brand,
            varianter: v.varianter || [],
            source_url: v.source_url,
            bilder: v.bilder || [],
            image_url: v.image_url
          }))
        })
      });

      const pushResult = await pushResponse.json();

      if (pushResult.success) {
        setCmsPushResult({
          success: true,
          created: pushResult.summary?.created || 0,
          updated: pushResult.summary?.updated || 0,
          failed: pushResult.summary?.failed || 0
        });
        setUpdates(prev => [...prev, {
          step: 'cms_push_complete',
          message: `CMS updated: ${pushResult.summary?.created || 0} created, ${pushResult.summary?.updated || 0} updated`,
          progress: 99
        }]);
        setCurrentStep('cms_push_complete');
      } else {
        throw new Error(pushResult.error || 'CMS push failed');
      }
    } catch (error) {
      console.error('CMS push error:', error);
      setCmsPushResult({
        success: false,
        created: 0,
        updated: 0,
        failed: 1
      });
      setUpdates(prev => [...prev, {
        step: 'cms_push_complete',
        message: `CMS push failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 99,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]);
    } finally {
      setIsPushingToCMS(false);
    }
  };

  useEffect(() => {
    // Prevent duplicate requests (React Strict Mode runs effects twice in dev)
    if (hasStartedRef.current) {
      console.log('🔄 Scrape already started, skipping duplicate request');
      return;
    }
    hasStartedRef.current = true;

    const startStreaming = async () => {
      try {
        console.log('🔄 Starting streaming scrape...');
        
        // Start the streaming request
        const response = await fetch('/api/scrape/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(scrapingParams)
        });

        if (!response.ok) {
          throw new Error(`Failed to start streaming: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Read the stream
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log('📡 Received update:', data);
                
                setUpdates(prev => [...prev, data]);
                setCurrentProgress(data.progress || 0);
                setCurrentStep(data.step || '');

                if (data.step === 'complete' && data.sessionId) {
                  // If auto-push is enabled, push to CMS before completing
                  if (scrapingParams.autoPushToCMS) {
                    console.log('📤 Auto-push enabled, pushing to CMS...');
                    pushToCMS(data.sessionId).then(() => {
                      setIsComplete(true);
                      onComplete(data.sessionId);
                    });
                  } else {
                    setIsComplete(true);
                    onComplete(data.sessionId);
                  }
                } else if (data.step === 'error') {
                  setHasError(true);
                  onError(data.error || data.message);
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
        setHasError(true);
        onError(error instanceof Error ? error.message : 'Streaming failed');
      }
    };

    startStreaming();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [scrapingParams, onComplete, onError]);

  const getStepStatus = (stepIndex: number, stepKey: string) => {
    const currentStepIndex = Object.keys(stepNames).indexOf(currentStep);
    
    if (hasError && stepKey === 'error') {
      return 'error';
    } else if (stepIndex < currentStepIndex || (stepIndex === currentStepIndex && currentProgress === 100)) {
      return 'complete';
    } else if (stepIndex === currentStepIndex) {
      return 'active';
    } else {
      return 'pending';
    }
  };

  // Build dynamic step list based on what actually happened
  const buildStepList = () => {
    const baseSteps = ['initializing', 'session_created', 'scraping_start', 'scraping_complete',
                      'saving_content'];

    // Check if PDF extraction occurred
    const hasPdfExtraction = updates.some(update =>
      update.step === 'pdf_extraction_start' ||
      update.step === 'pdf_custom_extractor' ||
      update.step === 'pdf_standard_ocr' ||
      update.step === 'pdf_claude_extraction'
    );

    if (hasPdfExtraction) {
      baseSteps.push('pdf_extraction_start');

      // Show which extraction method was used
      const hasCustomExtractor = updates.some(update => update.step === 'pdf_custom_extractor');
      const hasStandardOcr = updates.some(update => update.step === 'pdf_standard_ocr');
      const hasClaudeExtraction = updates.some(update => update.step === 'pdf_claude_extraction');

      if (hasCustomExtractor) {
        baseSteps.push('pdf_custom_extractor');
      }
      if (hasStandardOcr) {
        baseSteps.push('pdf_standard_ocr');
      }
      if (hasClaudeExtraction) {
        baseSteps.push('pdf_claude_extraction');
      }

      baseSteps.push('pdf_extraction_complete');

      // Check if Perplexity fact-checking occurred
      const hasFactCheck = updates.some(update =>
        update.step === 'pdf_fact_check_start' ||
        update.step === 'pdf_fact_check_complete' ||
        update.step === 'pdf_fact_check_failed' ||
        update.step === 'pdf_fact_check_error'
      );

      if (hasFactCheck) {
        baseSteps.push('pdf_fact_check_start');
        const factCheckResult = updates.find(update =>
          update.step === 'pdf_fact_check_complete' ||
          update.step === 'pdf_fact_check_failed' ||
          update.step === 'pdf_fact_check_error'
        );
        if (factCheckResult) {
          baseSteps.push(factCheckResult.step);
        }
      }
    }

    baseSteps.push('ai_processing_start', 'ai_batch_processing');

    // Check if fact-checking occurred
    const hasFactChecking = updates.some(update => update.step === 'fact_checking_complete');
    if (hasFactChecking) {
      baseSteps.push('fact_checking_complete');
    }

    baseSteps.push('ai_processing_complete', 'saving_ai_results', 'data_saved');

    // Check if CMS push occurred or is expected
    const hasCmsPush = updates.some(update =>
      update.step === 'cms_push_start' ||
      update.step === 'cms_push_complete'
    ) || scrapingParams.autoPushToCMS;

    if (hasCmsPush) {
      baseSteps.push('cms_push_start', 'cms_push_complete');
    }

    baseSteps.push('complete');
    return baseSteps;
  };
  
  const allSteps = buildStepList();

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isComplete ? '🎉 Scraping Complete!' : hasError ? '❌ Scraping Failed' : '🚀 Scraping in Progress'}
        </h2>
        <p className="text-gray-600">
          Scraping: <span className="font-medium">{new URL(scrapingParams.url).hostname}</span>
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm text-gray-500">{Math.round(currentProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              hasError ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {allSteps.map((stepKey, index) => {
          const status = getStepStatus(index, stepKey);
          const update = updates.find(u => u.step === stepKey);
          
          return (
            <div 
              key={stepKey} 
              className={`flex items-start space-x-4 p-4 rounded-lg border transition-all duration-300 ${
                status === 'active' ? 'bg-blue-50 border-blue-200' :
                status === 'complete' ? 'bg-green-50 border-green-200' :
                status === 'error' ? 'bg-red-50 border-red-200' :
                'bg-gray-50 border-gray-200'
              }`}
            >
              {/* Icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                status === 'active' ? 'bg-blue-500 text-white animate-pulse' :
                status === 'complete' ? 'bg-green-500 text-white' :
                status === 'error' ? 'bg-red-500 text-white' :
                'bg-gray-300 text-gray-500'
              }`}>
                {status === 'active' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  stepIcons[stepKey] || '⚪'
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${
                  status === 'active' ? 'text-blue-900' :
                  status === 'complete' ? 'text-green-900' :
                  status === 'error' ? 'text-red-900' :
                  'text-gray-500'
                }`}>
                  {stepNames[stepKey]}
                </div>
                {update && (
                  <div className={`text-sm mt-1 ${
                    status === 'active' ? 'text-blue-700' :
                    status === 'complete' ? 'text-green-700' :
                    status === 'error' ? 'text-red-700' :
                    'text-gray-600'
                  }`}>
                    {update.message}
                  </div>
                )}
                {status === 'pending' && (
                  <div className="text-sm text-gray-500 mt-1">
                    Waiting...
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex-shrink-0">
                {status === 'complete' && (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {status === 'error' && (
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {status === 'active' && (
                  <div className="w-6 h-6 bg-blue-500 rounded-full animate-pulse" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Updates Log */}
      {updates.length > 0 && (
        <div className="mt-8">
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              View detailed log ({updates.length} updates)
            </summary>
            <div className="mt-4 bg-gray-900 rounded-lg p-4 text-sm font-mono text-green-400 max-h-64 overflow-y-auto">
              {updates.map((update, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {update.message}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}