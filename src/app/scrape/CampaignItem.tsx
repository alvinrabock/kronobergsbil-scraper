import React, { useState } from 'react';

interface VehicleModel {
    name: string;
    price: number;
    old_price?: number;
    privatleasing?: number;
    company_leasing_price?: number;
    loan_price?: number;
    thumbnail?: string;
}

interface Campaign {
    title: string;
    description: string;
    content?: string;
    thumbnail?: string;
    brand: string;
    vehicle_model: VehicleModel[];
    campaign_start: string;
    campaign_end: string;
    whats_included?: Array<{ name: string; description: string }>;
    free_text?: string;
}

interface CampaignItemProps {
    campaign: Campaign;
}

const CampaignItem: React.FC<CampaignItemProps> = ({ campaign }) => {
    const [selectedModel, setSelectedModel] = useState<number>(0);

    // Helper function to format price
    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('sv-SE').format(price);
    };

    // Helper function to format date
    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString('sv-SE');
        } catch {
            return dateString;
        }
    };

    const currentModel = campaign.vehicle_model[selectedModel];
    const hasCampaignPrice = currentModel?.old_price && currentModel.price < currentModel.old_price;

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            {/* Campaign Image */}
            <div className="relative">
                <div className="relative w-full aspect-video bg-gray-100">
                    {campaign.thumbnail ? (
                        <img
                            src={campaign.thumbnail}
                            alt={campaign.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                    )}

                    {/* Campaign Badge */}
                    <div className="absolute top-3 left-3">
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            KAMPANJ
                        </span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-grow flex flex-col p-4">
                {/* Header with Title and Brand */}
                <div className="flex flex-row items-center justify-between gap-3 mb-3">
                    <h3 className="text-lg font-bold text-gray-900 line-clamp-2">
                        {campaign.title}
                    </h3>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {campaign.brand}
                        </div>
                    </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {campaign.description}
                </p>

                {/* Vehicle Model Selection */}
                {campaign.vehicle_model.length > 1 && (
                    <div className="mb-3">
                        <label className="text-xs text-gray-500 block mb-1">Välj modell:</label>
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(Number(e.target.value))}
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {campaign.vehicle_model.map((model, index) => (
                                <option key={index} value={index}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Current Model Info */}
                <div className="border-t border-b py-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{currentModel?.name}</h4>
                        {currentModel?.thumbnail && (
                            <img
                                src={currentModel.thumbnail}
                                alt={currentModel.name}
                                className="w-12 h-8 object-cover rounded"
                            />
                        )}
                    </div>

                    {/* Main Price */}
                    <div className="mb-3">
                        <span className="text-xs text-gray-500 block">Pris</span>
                        <div className="flex items-center gap-2">
                            <p className={`text-lg font-bold ${hasCampaignPrice ? 'text-red-500' : 'text-green-700'}`}>
                                Från {formatPrice(currentModel?.price || 0)} SEK
                            </p>
                            {currentModel?.old_price && (
                                <p className="text-sm text-gray-500 line-through">
                                    {formatPrice(currentModel.old_price)} SEK
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Financing Options - Styled like KampanjerItem */}
                    {((currentModel?.privatleasing && currentModel.privatleasing > 0) ||
                        (currentModel?.loan_price && currentModel.loan_price > 0) ||
                        (currentModel?.company_leasing_price && currentModel.company_leasing_price > 0)) && (
                            <div className="flex flex-row flex-wrap items-start border-t border-b py-2 gap-x-8">
                                {/* Privatleasing */}
                                {currentModel?.privatleasing && currentModel.privatleasing > 0 && (
                                    <div className="mb-3">
                                        <span className="text-sm text-muted-foreground">Privatleasing</span>
                                        <p className="text-sm font-medium text-red-500">
                                            {formatPrice(currentModel.privatleasing)} SEK/månad
                                        </p>
                                    </div>
                                )}

                                {/* Loan */}
                                {currentModel?.loan_price && currentModel.loan_price > 0 && (
                                    <div className="mb-3">
                                        <span className="text-sm text-muted-foreground">Finansieringspris</span>
                                        <p className="text-sm font-medium text-red-500">
                                            {formatPrice(currentModel.loan_price)} SEK/månad
                                        </p>
                                    </div>
                                )}

                                {/* Company Leasing */}
                                {currentModel?.company_leasing_price && currentModel.company_leasing_price > 0 && (
                                    <div className="mb-3">
                                        <span className="text-sm text-muted-foreground">Företagsleasing</span>
                                        <p className="text-sm font-medium text-red-500">
                                            {formatPrice(currentModel.company_leasing_price)} SEK/månad
                                            <span className="text-xs"> exkl moms</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                </div>

                {/* What's Included */}
                {campaign.whats_included && campaign.whats_included.length > 0 && (
                    <div className="mb-3">
                        <span className="text-xs text-gray-500 block mb-1">Ingår i kampanjen:</span>
                        <div className="flex flex-wrap gap-1">
                            {campaign.whats_included.slice(0, 3).map((item, index) => (
                                <span
                                    key={index}
                                    className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
                                    title={item.description}
                                >
                                    {item.name}
                                </span>
                            ))}
                            {campaign.whats_included.length > 3 && (
                                <span className="text-xs text-gray-500">
                                    +{campaign.whats_included.length - 3} till
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex flex-row items-center justify-between pt-3 mt-auto text-xs">
                    <div className="text-gray-600">
                        <span>Kampanj pågår</span>
                    </div>

                    <div className="text-right text-gray-600">
                        <div>Slutar: {formatDate(campaign.campaign_end)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CampaignItem;