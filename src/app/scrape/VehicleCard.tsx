"use client";

import { useState } from 'react';

// Fuel type color mapping
const fuelTypeColors: Record<string, { bg: string; text: string }> = {
    'El': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    'Hybrid': { bg: 'bg-teal-100', text: 'text-teal-800' },
    'Bensin': { bg: 'bg-amber-100', text: 'text-amber-800' },
    'Diesel': { bg: 'bg-slate-100', text: 'text-slate-800' },
};

// Transmission color mapping
const transmissionColors: Record<string, { bg: string; text: string }> = {
    'Automat': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    'Manuell': { bg: 'bg-gray-100', text: 'text-gray-800' },
    'e-CVT': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
};

// Type definitions - Updated to match NEW database schema
interface VariantSpecs {
    power_kw?: number | null;
    power_hp?: number | null;
    torque_nm?: number | null;
    top_speed_kmh?: number | null;
    acceleration_0_100?: number | null;
    fuel_consumption_l_100km?: number | null;
    consumption_kwh_100km?: number | null;
    co2_g_km?: number | null;
    range_km_wltp?: number | null;
    battery_kwh?: number | null;
    curb_weight_kg?: number | null;
    max_towing_kg?: number | null;
}

interface VehicleVariant {
    id?: string;
    name: string;
    price?: number | null;
    old_price?: number | null;
    privatleasing?: number | null;
    old_privatleasing?: number | null;
    company_leasing?: number | null;
    old_company_leasing?: number | null;
    loan_price?: number | null;
    old_loan_price?: number | null;
    fuel_type?: 'Bensin' | 'Diesel' | 'Hybrid' | 'El' | null;
    transmission?: 'Manuell' | 'Automat' | 'e-CVT' | null;
    thumbnail?: string | null;
    specs?: VariantSpecs | null;
    equipment?: string[];
}

// Legacy type for backward compatibility
interface VehicleModel {
    id?: string;
    name: string;
    variant?: string;
    price?: number;
    old_price?: number;
    privatleasing?: number;
    old_privatleasing?: number;
    company_leasing_price?: number;
    old_company_leasing_price?: number;
    loan_price?: number;
    old_loan_price?: number;
    thumbnail_url?: string;
    fuel_type?: string;
    transmission?: string;
    equipment?: string[];
    utrustning?: string[];
    specs?: VariantSpecs | null;
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
    variants?: VehicleVariant[];     // New schema format
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

// Specs Section Component - Shows key technical specs
const SpecsSection: React.FC<{ specs: VariantSpecs | null | undefined }> = ({ specs }) => {
    if (!specs) return null;

    const specItems: { label: string; value: string | number | null | undefined; unit: string }[] = [
        { label: 'Effekt', value: specs.power_hp, unit: 'hk' },
        { label: 'Räckvidd', value: specs.range_km_wltp, unit: 'km' },
        { label: 'Batteri', value: specs.battery_kwh, unit: 'kWh' },
        { label: 'Förbrukning', value: specs.fuel_consumption_l_100km, unit: 'l/100km' },
        { label: 'El-förbrukning', value: specs.consumption_kwh_100km, unit: 'kWh/100km' },
        { label: 'CO₂', value: specs.co2_g_km, unit: 'g/km' },
        { label: '0-100', value: specs.acceleration_0_100, unit: 's' },
        { label: 'Toppfart', value: specs.top_speed_kmh, unit: 'km/h' },
    ];

    const displaySpecs = specItems.filter(s => s.value !== null && s.value !== undefined);

    if (displaySpecs.length === 0) return null;

    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {displaySpecs.slice(0, 4).map((spec, idx) => (
                <div key={idx} className="text-center px-2 py-1 bg-slate-50 rounded">
                    <div className="text-xs text-gray-500">{spec.label}</div>
                    <div className="text-xs font-semibold text-gray-800">
                        {spec.value} {spec.unit}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Equipment Section Component - Collapsible list of equipment items
const EquipmentSection: React.FC<{ equipment: string[] }> = ({ equipment }) => {
    const [isOpen, setIsOpen] = useState(false);
    const previewCount = 5;
    const hasMore = equipment.length > previewCount;

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-left hover:bg-gray-50 rounded transition-colors py-1"
            >
                <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Utrustning ({equipment.length})
                </span>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="mt-2">
                    <div className="flex flex-wrap gap-1.5">
                        {equipment.map((item, idx) => (
                            <span
                                key={idx}
                                className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {!isOpen && hasMore && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {equipment.slice(0, previewCount).map((item, idx) => (
                        <span
                            key={idx}
                            className="inline-block px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded text-xs"
                        >
                            {item}
                        </span>
                    ))}
                    <span className="inline-block px-1.5 py-0.5 text-violet-600 text-xs font-medium">
                        +{equipment.length - previewCount} mer...
                    </span>
                </div>
            )}

            {!isOpen && !hasMore && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {equipment.map((item, idx) => (
                        <span
                            key={idx}
                            className="inline-block px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded text-xs"
                        >
                            {item}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const VehicleCard: React.FC<VehicleCardProps> = ({
    vehicle,
    leasingMode = 'all',
    masterMatch
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Normalize vehicle_models/variants (handle all property name formats)
    // Convert new schema 'variants' to VehicleModel format for unified handling
    const normalizeVariantsToModels = (variants: VehicleVariant[]): VehicleModel[] => {
        return variants.map(v => ({
            id: v.id,
            name: v.name,
            price: v.price ?? undefined,
            old_price: v.old_price ?? undefined,
            privatleasing: v.privatleasing ?? undefined,
            old_privatleasing: v.old_privatleasing ?? undefined,
            company_leasing_price: v.company_leasing ?? undefined,
            old_company_leasing_price: v.old_company_leasing ?? undefined,
            loan_price: v.loan_price ?? undefined,
            old_loan_price: v.old_loan_price ?? undefined,
            thumbnail_url: v.thumbnail ?? undefined,
            fuel_type: v.fuel_type ?? undefined,
            transmission: v.transmission ?? undefined,
            equipment: v.equipment || [],
            specs: v.specs
        }));
    };

    const vehicleModels: VehicleModel[] = vehicle.variants
        ? normalizeVariantsToModels(vehicle.variants)
        : (vehicle.vehicle_models || vehicle.vehicle_model || []);
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

                                // Get equipment from either equipment or utrustning field
                                const equipment = model.equipment || model.utrustning || [];
                                const fuelType = model.fuel_type || model.technical_specifications?.engine?.fuel_type;
                                const transmission = model.transmission || model.technical_specifications?.drivetrain?.transmission;

                                return (
                                    <div key={model.id || idx} className="p-3 border border-gray-200 rounded-lg bg-white">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-900">{model.name}</h4>

                                                {/* Fuel Type & Transmission Badges */}
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {fuelType && (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fuelTypeColors[fuelType]?.bg || 'bg-gray-100'} ${fuelTypeColors[fuelType]?.text || 'text-gray-800'}`}>
                                                            {fuelType === 'El' && '⚡'} {fuelType}
                                                        </span>
                                                    )}
                                                    {transmission && (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${transmissionColors[transmission]?.bg || 'bg-gray-100'} ${transmissionColors[transmission]?.text || 'text-gray-800'}`}>
                                                            {transmission}
                                                        </span>
                                                    )}
                                                    {equipment.length > 0 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800">
                                                            {equipment.length} utrustningar
                                                        </span>
                                                    )}
                                                </div>

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

                                        {/* Technical Specs - if available */}
                                        {model.specs && (
                                            <SpecsSection specs={model.specs} />
                                        )}

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

                                        {/* Equipment List - Collapsible */}
                                        {equipment.length > 0 && (
                                            <EquipmentSection equipment={equipment} />
                                        )}
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
