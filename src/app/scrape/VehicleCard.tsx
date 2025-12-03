"use client";

import { useState } from 'react';
import { JSX } from "react";

// Type definitions - Updated to match database schema
interface VehicleModel {
    id?: string;
    name: string;
    variant?: string;
    price?: number;
    old_price?: number;
    privatleasing?: number;
    old_privatleasing?: number;  // Campaign: original monthly price before discount
    company_leasing_price?: number;
    old_company_leasing_price?: number;  // Campaign: original monthly price before discount
    loan_price?: number;
    old_loan_price?: number;  // Campaign: original monthly price before discount
    thumbnail_url?: string;
    // Legacy nested format support
    financing_options?: {
        privatleasing?: Array<{ monthly_price?: number; old_monthly_price?: number; period_months?: number; annual_mileage?: number }>;
        company_leasing?: Array<{ monthly_price?: number; old_monthly_price?: number; period_months?: number; benefit_value?: number }>;
        loan?: Array<{ monthly_price?: number; old_monthly_price?: number; interest_rate?: number }>;
    };
    technical_specifications?: {
        engine?: {
            type?: string;
            fuel_type?: string;
            power_hp?: number;
        };
        drivetrain?: {
            transmission?: string;
        };
    };
}

interface Vehicle {
    id?: string;
    title: string;
    brand?: string;
    thumbnail?: string;
    thumbnail_url?: string;
    description?: string;
    free_text?: string;
    vehicle_type?: string;  // "cars" or "transport_cars"
    body_type?: string;     // "suv", "sedan", "kombi", "halvkombi", "cab", "coupe", "minibuss", "pickup", "skåpbil"
    vehicle_model?: VehicleModel[];
    vehicle_models?: VehicleModel[]; // Database format uses plural
    warranty_info?: {
        vehicle_warranty_years?: number;
    };
}

interface MasterMatch {
    matched: boolean;
    master_vehicle_id?: string;
    master_variant_id?: string;
    confidence?: number;
}

interface VehicleCardProps {
    vehicle: Vehicle;
    leasingMode?: 'all' | 'privat-leasing' | 'foretag-leasing' | 'purchase' | 'leasing';
    masterMatch?: MasterMatch;
}

const VehicleCard: React.FC<VehicleCardProps> = ({
    vehicle,
    leasingMode = 'all',
    masterMatch
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Normalize vehicle_models (handle both singular and plural property names)
    const vehicleModels = vehicle.vehicle_models || vehicle.vehicle_model || [];
    const thumbnail = vehicle.thumbnail_url || vehicle.thumbnail;

    const formatPrice = (amount: number | undefined | null) => {
        if (!amount || amount === 0) return 'Pris på förfrågan';
        return new Intl.NumberFormat('sv-SE', {
            style: 'currency',
            currency: 'SEK',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const formatMonthlyPrice = (amount: number | undefined | null) => {
        if (!amount || amount === 0) return null;
        return `${amount.toLocaleString('sv-SE')} kr/mån`;
    };

    // Get privatleasing price from model (handles both flat and nested format)
    const getPrivatleasing = (model: VehicleModel): number | null => {
        // Flat format from database
        if (model.privatleasing && model.privatleasing > 0) {
            return model.privatleasing;
        }
        // Nested format (legacy)
        if (model.financing_options?.privatleasing?.[0]?.monthly_price) {
            return model.financing_options.privatleasing[0].monthly_price;
        }
        return null;
    };

    // Get company leasing price from model
    const getCompanyLeasing = (model: VehicleModel): number | null => {
        if (model.company_leasing_price && model.company_leasing_price > 0) {
            return model.company_leasing_price;
        }
        if (model.financing_options?.company_leasing?.[0]?.monthly_price) {
            return model.financing_options.company_leasing[0].monthly_price;
        }
        return null;
    };

    // Get loan price from model
    const getLoanPrice = (model: VehicleModel): number | null => {
        if (model.loan_price && model.loan_price > 0) {
            return model.loan_price;
        }
        if (model.financing_options?.loan?.[0]?.monthly_price) {
            return model.financing_options.loan[0].monthly_price;
        }
        return null;
    };

    // Get OLD (pre-discount) privatleasing price from model
    const getOldPrivatleasing = (model: VehicleModel): number | null => {
        if (model.old_privatleasing && model.old_privatleasing > 0) {
            return model.old_privatleasing;
        }
        if (model.financing_options?.privatleasing?.[0]?.old_monthly_price) {
            return model.financing_options.privatleasing[0].old_monthly_price;
        }
        return null;
    };

    // Get OLD (pre-discount) company leasing price from model
    const getOldCompanyLeasing = (model: VehicleModel): number | null => {
        if (model.old_company_leasing_price && model.old_company_leasing_price > 0) {
            return model.old_company_leasing_price;
        }
        if (model.financing_options?.company_leasing?.[0]?.old_monthly_price) {
            return model.financing_options.company_leasing[0].old_monthly_price;
        }
        return null;
    };

    // Get OLD (pre-discount) loan price from model
    const getOldLoanPrice = (model: VehicleModel): number | null => {
        if (model.old_loan_price && model.old_loan_price > 0) {
            return model.old_loan_price;
        }
        if (model.financing_options?.loan?.[0]?.old_monthly_price) {
            return model.financing_options.loan[0].old_monthly_price;
        }
        return null;
    };

    // Get lowest prices across all models
    const getLowestPrivatleasing = (): number | null => {
        let lowest: number | null = null;
        vehicleModels.forEach(model => {
            const price = getPrivatleasing(model);
            if (price && (lowest === null || price < lowest)) {
                lowest = price;
            }
        });
        return lowest;
    };

    const getLowestCompanyLeasing = (): number | null => {
        let lowest: number | null = null;
        vehicleModels.forEach(model => {
            const price = getCompanyLeasing(model);
            if (price && (lowest === null || price < lowest)) {
                lowest = price;
            }
        });
        return lowest;
    };

    const getLowestPurchasePrice = (): number | null => {
        let lowest: number | null = null;
        vehicleModels.forEach(model => {
            if (model.price && model.price > 0 && (lowest === null || model.price < lowest)) {
                lowest = model.price;
            }
        });
        return lowest;
    };

    const privateLeasingPrice = getLowestPrivatleasing();
    const companyLeasingPrice = getLowestCompanyLeasing();
    const purchasePrice = getLowestPurchasePrice();

    const hasPrivateLeasing = privateLeasingPrice !== null;
    const hasCompanyLeasing = companyLeasingPrice !== null;
    const hasPurchasePrice = purchasePrice !== null;

    return (
        <div className="w-full overflow-hidden bg-white rounded-lg shadow-md border border-gray-200">
            {/* Image Section */}
            {thumbnail && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100">
                    <img
                        src={thumbnail}
                        alt={vehicle.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                </div>
            )}

            {/* Header Section */}
            <div className="px-5 pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{vehicle.title}</h2>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {vehicle.brand && (
                                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                                    {vehicle.brand}
                                </span>
                            )}
                            {vehicle.body_type && (
                                <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-sm font-medium capitalize">
                                    {vehicle.body_type}
                                </span>
                            )}
                            {/* Master DB match indicator */}
                            {masterMatch?.matched && (
                                <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-sm font-medium" title="Finns i master-databasen">
                                    ✓ Master DB
                                </span>
                            )}
                            {masterMatch && !masterMatch.matched && (
                                <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-sm font-medium" title="Saknas i master-databasen">
                                    ⚠ Ej i Master
                                </span>
                            )}
                        </div>
                    </div>
                    {vehicle.vehicle_type && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                            {vehicle.vehicle_type === 'cars' ? 'Personbil' : 'Transportbil'}
                        </span>
                    )}
                </div>

                {/* Description */}
                {vehicle.description && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {vehicle.description}
                    </p>
                )}
            </div>

            {/* Pricing Summary Section */}
            <div className="px-5 py-3 bg-gray-50 border-t border-b border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {hasPurchasePrice && (
                        <div className="text-center p-2 bg-white rounded border">
                            <div className="text-xs text-gray-500 mb-1">Pris från</div>
                            <div className="text-lg font-bold text-gray-900">{formatPrice(purchasePrice)}</div>
                        </div>
                    )}
                    {hasPrivateLeasing && (
                        <div className="text-center p-2 bg-white rounded border">
                            <div className="text-xs text-gray-500 mb-1">Privatleasing</div>
                            <div className="text-lg font-bold text-green-600">{formatMonthlyPrice(privateLeasingPrice)}</div>
                        </div>
                    )}
                    {hasCompanyLeasing && (
                        <div className="text-center p-2 bg-white rounded border">
                            <div className="text-xs text-gray-500 mb-1">Företagsleasing</div>
                            <div className="text-lg font-bold text-blue-600">{formatMonthlyPrice(companyLeasingPrice)}</div>
                        </div>
                    )}
                    {!hasPurchasePrice && !hasPrivateLeasing && !hasCompanyLeasing && (
                        <div className="col-span-full text-center p-2 bg-white rounded border">
                            <div className="text-gray-500">Pris på förfrågan</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Vehicle Models Section */}
            {vehicleModels.length > 0 && (
                <div className="px-5 py-3">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center justify-between w-full text-left hover:bg-gray-50 p-2 -mx-2 rounded transition-colors"
                    >
                        <span className="text-sm font-semibold text-gray-900">
                            {vehicleModels.length} {vehicleModels.length === 1 ? 'variant' : 'varianter'}
                        </span>
                        <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="mt-3 space-y-2">
                            {vehicleModels.map((model, idx) => {
                                const modelPrivatleasing = getPrivatleasing(model);
                                const modelCompanyLeasing = getCompanyLeasing(model);
                                const modelLoanPrice = getLoanPrice(model);
                                const modelOldPrivatleasing = getOldPrivatleasing(model);
                                const modelOldCompanyLeasing = getOldCompanyLeasing(model);
                                const modelOldLoanPrice = getOldLoanPrice(model);

                                return (
                                    <div key={model.id || idx} className="p-3 border border-gray-200 rounded-lg bg-white">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-900">{model.name}</h4>
                                                {model.thumbnail_url && (
                                                    <img
                                                        src={model.thumbnail_url}
                                                        alt={model.name}
                                                        className="mt-2 w-20 h-12 object-cover rounded"
                                                    />
                                                )}
                                            </div>
                                            {model.price && model.price > 0 && (
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500">Pris</div>
                                                    <div className="font-bold text-gray-900">{formatPrice(model.price)}</div>
                                                    {model.old_price && model.old_price > 0 && model.old_price !== model.price && (
                                                        <div className="text-xs text-gray-400 line-through">{formatPrice(model.old_price)}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Financing Options */}
                                        <div className="grid grid-cols-3 gap-2 mt-2">
                                            {modelPrivatleasing && (
                                                <div className="p-2 bg-green-50 rounded text-center">
                                                    <div className="text-xs text-green-700">Privatleasing</div>
                                                    {modelOldPrivatleasing && modelOldPrivatleasing !== modelPrivatleasing && (
                                                        <div className="text-xs text-green-500 line-through">{formatMonthlyPrice(modelOldPrivatleasing)}</div>
                                                    )}
                                                    <div className="text-sm font-bold text-green-800">{formatMonthlyPrice(modelPrivatleasing)}</div>
                                                </div>
                                            )}
                                            {modelCompanyLeasing && (
                                                <div className="p-2 bg-blue-50 rounded text-center">
                                                    <div className="text-xs text-blue-700">Företag</div>
                                                    {modelOldCompanyLeasing && modelOldCompanyLeasing !== modelCompanyLeasing && (
                                                        <div className="text-xs text-blue-500 line-through">{formatMonthlyPrice(modelOldCompanyLeasing)}</div>
                                                    )}
                                                    <div className="text-sm font-bold text-blue-800">{formatMonthlyPrice(modelCompanyLeasing)}</div>
                                                </div>
                                            )}
                                            {modelLoanPrice && (
                                                <div className="p-2 bg-purple-50 rounded text-center">
                                                    <div className="text-xs text-purple-700">Lån</div>
                                                    {modelOldLoanPrice && modelOldLoanPrice !== modelLoanPrice && (
                                                        <div className="text-xs text-purple-500 line-through">{formatMonthlyPrice(modelOldLoanPrice)}</div>
                                                    )}
                                                    <div className="text-sm font-bold text-purple-800">{formatMonthlyPrice(modelLoanPrice)}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Free Text / Additional Info */}
            {vehicle.free_text && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500">{vehicle.free_text}</p>
                </div>
            )}
        </div>
    );
};

export default VehicleCard;
