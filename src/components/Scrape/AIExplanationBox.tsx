export const AIExplanationBox = () => {
    return (
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
         
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Så här fungerar vår AI-skrapning
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">1️⃣</span>
                <span>Vi scannar av URL:en och hämtar all innehåll</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">2️⃣</span>
                <span>Vi formaterar datan så en AI lätt kan förstå den</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">3️⃣</span>
                <span>AI:n analyserar datan och extraherar viktig information</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">4️⃣</span>
                <span>Färdig & städat data presenteras som är redo att användas direkt</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-blue-700 italic">
              Allt helt automatiskt - ingen manuell bearbetning krävs!
            </p>
          </div>
        </div>
      </div>
    );
  };