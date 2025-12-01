"use client";

import { useState } from 'react';
import { JSX } from "react";

// Type definitions
interface TechnicalSpecifications {
    engine?: {
        type?: string;
        fuel_type?: string;
        power_hp?: number;
    };
    drivetrain?: {
        transmission?: string;
    };
}

interface FinancingOption {
    monthly_price?: number;
    monthly_payment?: number;
    period_months?: number;
    contract_length_months?: number;
    annual_mileage?: number;
    mileage_limit?: number;
    benefit_value?: number;
    interest_rate?: number;
}

interface FinancingOptions {
    privatleasing?: FinancingOption[];
    company_leasing?: FinancingOption[];
    loan?: FinancingOption[];
}

interface VehicleModel {
    name: string;
    variant?: string;
    price?: number;
    technical_specifications?: TechnicalSpecifications;
    financing_options?: FinancingOptions;
}

interface WarrantyInfo {
    vehicle_warranty_years?: number;
}

interface Vehicle {
    title: string;
    brand?: string;
    thumbnail?: string;
    description?: string;
    warranty_info?: WarrantyInfo;
    vehicle_model?: VehicleModel[];
}

interface VehicleCardProps {
    vehicle: Vehicle;
    leasingMode?: 'all' | 'privat-leasing' | 'foretag-leasing' | 'purchase' | 'leasing';
}

interface FormattedFinancingOption {
    type: string;
    price: number | undefined;
    period?: number;
    mileage?: number;
    benefit?: number;
    rate?: number;
    icon: string;
}

const VehicleCard: React.FC<VehicleCardProps> = ({
    vehicle,
    leasingMode = 'all'
}) => {
    const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set());

    const toggleModel = (index: number) => {
        const newExpanded = new Set(expandedModels);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedModels(newExpanded);
    };

    const formatPrice = (amount: number | undefined) => {
        if (!amount || amount === 0) return 'Pris på förfrågan';
        return new Intl.NumberFormat('sv-SE', {
            style: 'currency',
            currency: 'SEK',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getFinancingDisplay = (financing: FinancingOptions | undefined): FormattedFinancingOption[] => {
        const options: FormattedFinancingOption[] = [];

        if (financing?.privatleasing?.length && financing.privatleasing.length > 0) {
            const option = financing.privatleasing[0];
            options.push({
                type: 'Privatleasing',
                price: option.monthly_price || option.monthly_payment,
                period: option.period_months || option.contract_length_months,
                mileage: option.annual_mileage || option.mileage_limit,
                icon: '🚗'
            });
        }

        if (financing?.company_leasing?.length && financing.company_leasing.length > 0) {
            const option = financing.company_leasing[0];
            options.push({
                type: 'Företagsleasing',
                price: option.monthly_price || option.monthly_payment,
                period: option.period_months || option.contract_length_months,
                mileage: option.annual_mileage || option.mileage_limit,
                benefit: option.benefit_value,
                icon: '🏢'
            });
        }

        if (financing?.loan?.length && financing.loan.length > 0) {
            const option = financing.loan[0];
            options.push({
                type: 'Billån',
                price: option.monthly_price || option.monthly_payment,
                period: option.period_months || option.contract_length_months,
                rate: option.interest_rate,
                icon: '🏦'
            });
        }

        return options;
    };

    // Helper function to safely format prices
    const formatFieldPrice = (price: number | null | undefined): string => {
        if (price === null || price === undefined || isNaN(price)) {
            return 'Pris på begäran';
        }
        return price.toLocaleString();
    };

    // Helper function to format field display
    const formatField = (field: string | string[] | undefined | null): string => {
        if (!field) return '';
        if (Array.isArray(field)) {
            return field.filter(item => item && item.trim().length > 0).join(', ');
        }
        return typeof field === 'string' ? field : '';
    };

    // Get fuel type from vehicle data
    const getFuelType = (): string | null => {
        if (vehicle.vehicle_model && vehicle.vehicle_model.length > 0) {
            const model = vehicle.vehicle_model[0];
            if (model.technical_specifications?.engine?.fuel_type) {
                return model.technical_specifications.engine.fuel_type;
            }
        }
        return null;
    };

    // Get fuel icon
    const fuelType = getFuelType();
    const fuelIcons: Record<string, JSX.Element> = {
        'Bensin': (
            <div className="w-7 h-7 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full">
                ⛽
            </div>
        ),
        'Petrol': (
            <div className="w-7 h-7 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full">
                ⛽
            </div>
        ),
        'Diesel': (
            <div className="w-7 h-7 flex items-center justify-center bg-yellow-100 text-yellow-600 rounded-full">
                🚛
            </div>
        ),
        'Electric': (
            <div className="w-7 h-7 flex items-center justify-center bg-green-100 text-green-600 rounded-full">
                ⚡
            </div>
        ),
        'El': (
            <div className="w-7 h-7 flex items-center justify-center bg-green-100 text-green-600 rounded-full">
                ⚡
            </div>
        ),
        'Hybrid': (
            <div className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full">
                🔋
            </div>
        ),
        'Bensin/El': (
            <div className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full">
                🔋
            </div>
        ),
        'Bensin-El': (
            <div className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full">
                🔋
            </div>
        ),
        'Petrol/Electric': (
            <div className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full">
                🔋
            </div>
        ),
    };

    // Get primary vehicle model for pricing
    const primaryModel = vehicle.vehicle_model && vehicle.vehicle_model.length > 0
        ? vehicle.vehicle_model[0]
        : null;

    // Helper function to get the lowest private leasing price across all vehicle models
    const getLowestPrivateLeasingPrice = (): number | null => {
        if (!vehicle.vehicle_model || vehicle.vehicle_model.length === 0) return null;
        
        let lowestPrice: number | null = null;
        
        vehicle.vehicle_model.forEach(model => {
            if (model.financing_options?.privatleasing && Array.isArray(model.financing_options.privatleasing)) {
                model.financing_options.privatleasing.forEach(option => {
                    const price = option.monthly_price || option.monthly_payment;
                    if (price && price > 0 && (lowestPrice === null || price < lowestPrice)) {
                        lowestPrice = price;
                    }
                });
            }
        });
        
        return lowestPrice;
    };

    // Helper function to get the lowest business leasing price across all vehicle models
    const getLowestBusinessLeasingPrice = (): number | null => {
        if (!vehicle.vehicle_model || vehicle.vehicle_model.length === 0) return null;
        
        let lowestPrice: number | null = null;
        
        vehicle.vehicle_model.forEach(model => {
            if (model.financing_options?.company_leasing && Array.isArray(model.financing_options.company_leasing)) {
                model.financing_options.company_leasing.forEach(option => {
                    const price = option.monthly_price || option.monthly_payment;
                    if (price && price > 0 && (lowestPrice === null || price < lowestPrice)) {
                        lowestPrice = price;
                    }
                });
            }
        });
        
        return lowestPrice;
    };

    // Get pricing across all models (lowest prices)
    const privateLeasingPrice = getLowestPrivateLeasingPrice();
    const businessLeasingPrice = getLowestBusinessLeasingPrice();
    const purchasePrice = primaryModel?.price;

    // Debug logging
    console.log('Debug pricing:', {
        privateLeasingPrice,
        businessLeasingPrice,
        purchasePrice,
        hasVehicleModel: !!vehicle.vehicle_model,
        vehicleModelLength: vehicle.vehicle_model?.length,
        firstModelFinancing: vehicle.vehicle_model?.[0]?.financing_options,
        vehicleTitle: vehicle.title
    });

    // Check if we have any leasing options across all models
    const hasPrivateLeasing = privateLeasingPrice !== null && privateLeasingPrice > 0;
    const hasBusinessLeasing = businessLeasingPrice !== null && businessLeasingPrice > 0;
    const hasPurchasePrice = primaryModel?.price && primaryModel.price > 0;

    // Check leasing modes
    const isPrivatLeasingMode = leasingMode === 'privat-leasing';
    const isForetagLeasingMode = leasingMode === 'foretag-leasing';

    return (
        <div className="w-full overflow-hidden bg-white rounded-lg shadow-sm border border-gray-100">
            {/* Image Section */}
            <div className="relative aspect-[16/10] w-full overflow-hidden">
                {vehicle.thumbnail && (
                    <div className="relative w-full h-full">
                        <img
                            src={vehicle.thumbnail}
                            alt={vehicle.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Header Section */}
            <div className="px-6 pt-4 pb-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold leading-tight text-gray-900">{vehicle.title}</h2>
                    <div className="flex flex-row gap-2 items-center">
                        {fuelType && fuelIcons[fuelType] && (
                            <div className="flex gap-2">
                                {fuelIcons[fuelType]}
                            </div>
                        )}
                    </div>
                </div>
                {/* Brand badge */}
                {vehicle.brand && (
                    <div className="flex justify-start mt-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                            {vehicle.brand}
                        </span>
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="px-6 space-y-4">
                <div className="space-y-2">
                    {/* Pricing Section */}
                    {isPrivatLeasingMode ? (
                        // PRIVATE LEASING MODE
                        <div className="space-y-2">
                            {hasPrivateLeasing && (
                                <div className="p-4 rounded-xl bg-gradient-to-r from-slate-800/5 to-slate-900/5 border border-slate-700">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm text-black/60 font-medium">
                                                Privatleasingpris
                                            </span>
                                            <div className="text-2xl font-bold text-black">
                                                Från {formatFieldPrice(privateLeasingPrice)} SEK/mån
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {hasBusinessLeasing && (
                                <div className="text-left py-2">
                                    <span className="text-sm text-gray-500">
                                        Företagsleasing från {formatFieldPrice(businessLeasingPrice)} SEK/mån
                                    </span>
                                </div>
                            )}

                            {hasPurchasePrice && (
                                <div className="text-left py-1">
                                    <span className="text-sm text-gray-400">
                                        Eller köp för {formatPrice(purchasePrice)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : isForetagLeasingMode ? (
                        // BUSINESS LEASING MODE
                        <div className="space-y-2">
                            {hasBusinessLeasing && (
                                <div className="p-4 rounded-xl bg-gradient-to-r from-slate-800/5 to-slate-900/5 border border-slate-700">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm text-black/60 font-medium">
                                                Företagsleasingpris
                                            </span>
                                            <div className="text-2xl font-bold text-black">
                                                Från {formatFieldPrice(businessLeasingPrice)} SEK/mån
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {hasPrivateLeasing && (
                                <div className="text-left py-2">
                                    <span className="text-sm text-gray-500">
                                        Privatleasing från {formatFieldPrice(privateLeasingPrice)} SEK/mån
                                    </span>
                                </div>
                            )}

                            {hasPurchasePrice && (
                                <div className="text-left py-1">
                                    <span className="text-sm text-gray-400">
                                        Eller köp för {formatPrice(purchasePrice)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        // NORMAL MODE - Show all prices
                        <div className="space-y-4">
                            {/* Purchase Price */}
                            {hasPurchasePrice && (
                                <div className="flex flex-col">
                                    <span className="text-sm text-gray-600">Pris</span>
                                    <span className="text-lg font-medium">Från {formatPrice(purchasePrice)}</span>
                                </div>
                            )}

                            {/* Leasing Prices Section */}
                            {(hasPrivateLeasing || hasBusinessLeasing) && (
                                <div className="border-t pt-4">
                                    <div className="flex flex-row flex-wrap gap-x-8 gap-y-4 items-baseline">
                                        {/* Private Leasing */}
                                        {hasPrivateLeasing && (
                                            <div className="flex flex-col">
                                                <span className="text-sm text-gray-600">Privatleasingpris</span>
                                                <span className="text-lg font-medium">Från {formatFieldPrice(privateLeasingPrice)} SEK/mån</span>
                                            </div>
                                        )}

                                        {/* Business Leasing */}
                                        {hasBusinessLeasing && (
                                            <div className="flex flex-col">
                                                <span className="text-sm text-gray-600">Företagsleasingpris</span>
                                                <span className="text-lg font-medium">Från {formatFieldPrice(businessLeasingPrice)} SEK/mån</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Show "Pris på begäran" if no pricing is available */}
                            {!hasPurchasePrice && !hasPrivateLeasing && !hasBusinessLeasing && (
                                <div className="flex flex-col">
                                    <span className="text-sm text-gray-600">Pris</span>
                                    <span className="text-lg font-medium">Pris på begäran</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Vehicle Details */}
                    <div className="flex flex-row flex-wrap gap-x-8 gap-y-4 items-baseline pt-4 border-t">
                        {/* Engine Type */}
                        {primaryModel?.technical_specifications?.engine?.type && (
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-600">Motor</span>
                                <span className="text-base">
                                    {primaryModel.technical_specifications.engine.type}
                                </span>
                            </div>
                        )}

                        {/* Fuel Type */}
                        {fuelType && (
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-600">Bränsle</span>
                                <span className="text-base">
                                    {fuelType}
                                </span>
                            </div>
                        )}

                        {/* Transmission */}
                        {primaryModel?.technical_specifications?.drivetrain?.transmission && (
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-600">Växellåda</span>
                                <span className="text-base">
                                    {primaryModel.technical_specifications.drivetrain.transmission}
                                </span>
                            </div>
                        )}

                        {/* Power */}
                        {primaryModel?.technical_specifications?.engine?.power_hp && (
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-600">Effekt</span>
                                <span className="text-base">
                                    {primaryModel.technical_specifications.engine.power_hp} hk
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Expandable Vehicle Models */}
                {vehicle.vehicle_model && vehicle.vehicle_model.length > 1 && (
                    <div className="border-t pt-4">
                        <button
                            onClick={() => toggleModel(0)}
                            className="flex items-center justify-between w-full text-left hover:bg-gray-50 p-2 rounded transition-colors"
                        >
                            <span className="text-sm font-medium text-gray-900">
                                Visa alla modeller ({vehicle.vehicle_model.length})
                            </span>
                            <svg
                                className={`w-5 h-5 transition-transform ${expandedModels.has(0) ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {expandedModels.has(0) && (
                            <div className="mt-4 space-y-3">
                                {vehicle.vehicle_model.map((model: VehicleModel, idx: number) => {
                                    const financingOptions = getFinancingDisplay(model.financing_options);

                                    return (
                                        <div key={idx} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h5 className="font-medium text-gray-900">{model.name}</h5>
                                                    {model.variant && (
                                                        <p className="text-sm text-gray-600">{model.variant}</p>
                                                    )}
                                                </div>
                                                {model.price && model.price > 0 && (
                                                    <div className="text-right">
                                                        <div className="font-bold text-green-600">
                                                            {formatPrice(model.price)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Financing Options */}
                                            {financingOptions.length > 0 && (
                                                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 mt-3">
                                                    {financingOptions.map((option, optIdx) => (
                                                        <div key={optIdx} className="p-2 border border-gray-200 rounded bg-white">
                                                            <div className="flex items-center space-x-2 mb-1">
                                                                <span>{option.icon}</span>
                                                                <span className="font-medium text-xs">{option.type}</span>
                                                            </div>
                                                            <div className="text-sm font-bold text-gray-900">
                                                                {typeof option.price === 'number' ? formatFieldPrice(option.price) : 'Pris på begäran'} SEK/mån
                                                            </div>
                                                            {option.period && (
                                                                <div className="text-xs text-gray-600">
                                                                    {option.period} månader
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Section */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                <div className="flex flex-row items-center justify-between w-full">
                    {/* Description */}
                    {vehicle.description && (
                        <div className="flex flex-col items-start">
                            <span className="text-sm text-gray-600">Beskrivning</span>
                            <p className="text-sm text-gray-700">{vehicle.description}</p>
                        </div>
                    )}

                    {/* Warranty Info */}
                    {vehicle.warranty_info?.vehicle_warranty_years && (
                        <div className="flex items-start gap-1">
                            <span className="text-sm text-gray-600">
                                Garanti {vehicle.warranty_info.vehicle_warranty_years} år
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VehicleCard;