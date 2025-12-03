/**
 * TypeScript types for Master Vehicle Database
 *
 * Architecture:
 *   - Master tables (static): Populated once from technical PDFs
 *   - Price tables (dynamic): Updated daily via scraping
 */

// =============================================================================
// MASTER TABLES (STATIC DATA)
// =============================================================================

export interface MasterBrand {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterVehicle {
  id: string;
  brand_id: string;
  name: string;
  slug: string | null;
  vehicle_type: 'cars' | 'transport_cars';
  description: string | null;
  thumbnail_url: string | null;
  model_year: number | null;
  pdf_source_url: string | null;
  pdf_extracted_at: string | null;
  pdf_type: 'pricelist' | 'brochure' | 'specifications' | 'combined' | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterVariant {
  id: string;
  vehicle_id: string;
  name: string;
  trim_level: string | null;
  motor_type: string | null;  // EL, BENSIN, DIESEL, HYBRID, LADDHYBRID, PHEV
  motor_key: string | null;
  drivlina: string | null;    // 2WD, 4WD, AWD
  vaxellada: string | null;   // Automat, Manuell
  is_plus_variant: boolean;
  base_variant_id: string | null;
  included_packages: string[] | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MasterMotorSpecs {
  id: string;
  vehicle_id: string;
  motor_key: string;
  motor_type: string;
  effekt_kw: number | null;
  effekt_hk: number | null;
  systemeffekt_kw: number | null;
  systemeffekt_hk: number | null;
  batterikapacitet_kwh: number | null;
  rackvidd_km: number | null;
  acceleration_0_100: number | null;
  toppfart: number | null;
  forbrukning: string | null;
  co2_utslapp: number | null;
  vaxellada: string | null;
  antal_vaxlar: number | null;
  created_at: string;
}

export interface MasterDimensions {
  id: string;
  vehicle_id: string;
  langd: number | null;
  bredd: number | null;
  bredd_med_speglar: number | null;
  hojd: number | null;
  axelavstand: number | null;
  bagageutrymme_liter: number | null;
  bagageutrymme_max_liter: number | null;
  tjanstevikt: number | null;
  max_last: number | null;
  totalvikt: number | null;
  max_slap_bromsat: number | null;
  max_slap_obromsat: number | null;
  tankvolym_liter: number | null;
  created_at: string;
}

export interface MasterEquipment {
  id: string;
  vehicle_id: string;
  name: string;
  category: string | null;
  description: string | null;
  standard_for: string[] | null;
  tillval_for: string[] | null;
  tillval_via_paket: string | null;
  tillval_pris: number | null;
  created_at: string;
}

export interface MasterColor {
  id: string;
  vehicle_id: string;
  name: string;
  color_code: string | null;
  color_type: 'solid' | 'metallic' | 'pearl' | 'matte' | null;
  hex_code: string | null;
  pris: number | null;
  is_standard: boolean;
  available_for_trims: string[] | null;
  created_at: string;
}

export interface MasterWheel {
  id: string;
  vehicle_id: string;
  name: string;
  size: string | null;
  style: string | null;
  pris: number | null;
  standard_for: string[] | null;
  tillval_for: string[] | null;
  created_at: string;
}

export interface MasterInterior {
  id: string;
  vehicle_id: string;
  name: string;
  material: string | null;
  color: string | null;
  pris: number | null;
  standard_for: string[] | null;
  tillval_for: string[] | null;
  created_at: string;
}

export interface MasterPackage {
  id: string;
  vehicle_id: string;
  name: string;
  description: string | null;
  pris: number | null;
  available_for_trims: string[] | null;
  included_items: string[] | null;
  created_at: string;
}

export interface MasterWarranty {
  id: string;
  vehicle_id: string;
  nybilsgaranti: string | null;
  vagassistans: string | null;
  rostgaranti: string | null;
  batterigaranti: string | null;
  lackgaranti: string | null;
  service_interval: string | null;
  created_at: string;
}

// =============================================================================
// PRICE TABLES (DYNAMIC DATA)
// =============================================================================

export interface VariantPrice {
  id: string;
  variant_id: string;
  pris: number | null;
  old_pris: number | null;
  privatleasing: number | null;
  old_privatleasing: number | null;
  foretagsleasing: number | null;
  old_foretagsleasing: number | null;
  billan_per_man: number | null;
  old_billan_per_man: number | null;
  leasing_months: number | null;
  leasing_km_per_year: number | null;
  leasing_deposit: number | null;
  is_campaign: boolean;
  campaign_name: string | null;
  campaign_end: string | null;
  source_url: string | null;
  scraped_at: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  variant_id: string;
  pris: number | null;
  privatleasing: number | null;
  foretagsleasing: number | null;
  billan_per_man: number | null;
  is_campaign: boolean;
  campaign_name: string | null;
  source_url: string | null;
  recorded_at: string;
}

// =============================================================================
// LINKING TABLE
// =============================================================================

export interface VehicleMasterLink {
  id: string;
  scraped_vehicle_id: string | null;
  scraped_model_id: string | null;
  master_vehicle_id: string | null;
  master_variant_id: string | null;
  match_confidence: number | null;
  match_method: 'exact' | 'fuzzy' | 'manual' | null;
  last_price_update: string | null;
  prices_updated_count: number;
  created_at: string;
}

// =============================================================================
// VIEW TYPES
// =============================================================================

export interface VehicleCatalogItem {
  brand: string;
  vehicle_name: string;
  slug: string | null;
  vehicle_type: 'cars' | 'transport_cars';
  model_year: number | null;
  thumbnail_url: string | null;
  variant_name: string;
  trim_level: string | null;
  motor_type: string | null;
  drivlina: string | null;
  vaxellada: string | null;
  pris: number | null;
  old_pris: number | null;
  privatleasing: number | null;
  foretagsleasing: number | null;
  billan_per_man: number | null;
  is_campaign: boolean;
  campaign_name: string | null;
  campaign_end: string | null;
  price_updated_at: string | null;
  effekt_hk: number | null;
  rackvidd_km: number | null;
  forbrukning: string | null;
  langd: number | null;
  bagageutrymme_liter: number | null;
}

export interface PriceChangeItem {
  brand: string;
  vehicle: string;
  variant: string;
  pris: number | null;
  privatleasing: number | null;
  is_campaign: boolean;
  campaign_name: string | null;
  recorded_at: string;
  prev_pris: number | null;
  price_change: number | null;
}

// =============================================================================
// INSERT TYPES (for creating new records)
// =============================================================================

export interface InsertMasterBrand {
  name: string;
  logo_url?: string | null;
  website_url?: string | null;
}

export interface InsertMasterVehicle {
  brand_id: string;
  name: string;
  slug?: string | null;
  vehicle_type?: 'cars' | 'transport_cars';
  description?: string | null;
  thumbnail_url?: string | null;
  model_year?: number | null;
  pdf_source_url?: string | null;
  pdf_type?: 'pricelist' | 'brochure' | 'specifications' | 'combined' | null;
  is_active?: boolean;
}

export interface InsertMasterVariant {
  vehicle_id: string;
  name: string;
  trim_level?: string | null;
  motor_type?: string | null;
  motor_key?: string | null;
  drivlina?: string | null;
  vaxellada?: string | null;
  is_plus_variant?: boolean;
  base_variant_id?: string | null;
  included_packages?: string[] | null;
  sort_order?: number;
}

export interface InsertMasterMotorSpecs {
  vehicle_id: string;
  motor_key: string;
  motor_type: string;
  effekt_kw?: number | null;
  effekt_hk?: number | null;
  systemeffekt_kw?: number | null;
  systemeffekt_hk?: number | null;
  batterikapacitet_kwh?: number | null;
  rackvidd_km?: number | null;
  acceleration_0_100?: number | null;
  toppfart?: number | null;
  forbrukning?: string | null;
  co2_utslapp?: number | null;
  vaxellada?: string | null;
  antal_vaxlar?: number | null;
}

export interface InsertMasterDimensions {
  vehicle_id: string;
  langd?: number | null;
  bredd?: number | null;
  bredd_med_speglar?: number | null;
  hojd?: number | null;
  axelavstand?: number | null;
  bagageutrymme_liter?: number | null;
  bagageutrymme_max_liter?: number | null;
  tjanstevikt?: number | null;
  max_last?: number | null;
  totalvikt?: number | null;
  max_slap_bromsat?: number | null;
  max_slap_obromsat?: number | null;
  tankvolym_liter?: number | null;
}

export interface InsertMasterEquipment {
  vehicle_id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  standard_for?: string[] | null;
  tillval_for?: string[] | null;
  tillval_via_paket?: string | null;
  tillval_pris?: number | null;
}

export interface InsertMasterColor {
  vehicle_id: string;
  name: string;
  color_code?: string | null;
  color_type?: 'solid' | 'metallic' | 'pearl' | 'matte' | null;
  hex_code?: string | null;
  pris?: number | null;
  is_standard?: boolean;
  available_for_trims?: string[] | null;
}

export interface InsertMasterWheel {
  vehicle_id: string;
  name: string;
  size?: string | null;
  style?: string | null;
  pris?: number | null;
  standard_for?: string[] | null;
  tillval_for?: string[] | null;
}

export interface InsertMasterInterior {
  vehicle_id: string;
  name: string;
  material?: string | null;
  color?: string | null;
  pris?: number | null;
  standard_for?: string[] | null;
  tillval_for?: string[] | null;
}

export interface InsertMasterPackage {
  vehicle_id: string;
  name: string;
  description?: string | null;
  pris?: number | null;
  available_for_trims?: string[] | null;
  included_items?: string[] | null;
}

export interface InsertMasterWarranty {
  vehicle_id: string;
  nybilsgaranti?: string | null;
  vagassistans?: string | null;
  rostgaranti?: string | null;
  batterigaranti?: string | null;
  lackgaranti?: string | null;
  service_interval?: string | null;
}

export interface InsertVariantPrice {
  variant_id: string;
  pris?: number | null;
  old_pris?: number | null;
  privatleasing?: number | null;
  old_privatleasing?: number | null;
  foretagsleasing?: number | null;
  old_foretagsleasing?: number | null;
  billan_per_man?: number | null;
  old_billan_per_man?: number | null;
  leasing_months?: number | null;
  leasing_km_per_year?: number | null;
  leasing_deposit?: number | null;
  is_campaign?: boolean;
  campaign_name?: string | null;
  campaign_end?: string | null;
  source_url?: string | null;
}

// =============================================================================
// COMPLETE VEHICLE DATA (for PDF import)
// =============================================================================

/**
 * Complete vehicle data structure for importing from PDF
 * This matches the JSON schema designed for Google Document AI
 */
export interface PDFVehicleData {
  meta: {
    pdf_type: 'pricelist' | 'brochure' | 'specifications' | 'combined';
    brand: string;
    model: string;
    model_year?: number;
    giltig_fran?: string;
    giltig_till?: string;
    pdf_url?: string;
  };

  dimensioner?: {
    langd_mm?: number;
    bredd_mm?: number;
    bredd_med_speglar_mm?: number;
    hojd_mm?: number;
    axelavstand_mm?: number;
    bagageutrymme_liter?: number;
    bagageutrymme_max_liter?: number;
    tjanstevikt_kg?: number;
    max_last_kg?: number;
    totalvikt_kg?: number;
    max_slap_bromsat_kg?: number;
    max_slap_obromsat_kg?: number;
    tankvolym_liter?: number;
  };

  motor_specs?: {
    [motor_key: string]: {
      motor_type: string;
      effekt_kw?: number;
      effekt_hk?: number;
      systemeffekt_kw?: number;
      systemeffekt_hk?: number;
      batterikapacitet_kwh?: number;
      rackvidd_km?: number;
      acceleration_0_100?: number;
      toppfart?: number;
      forbrukning?: string;
      co2_utslapp?: number;
      vaxellada?: string;
      antal_vaxlar?: number;
    };
  };

  utrustning?: Array<{
    name: string;
    category?: string;
    description?: string;
    standard_for?: string[];
    tillval_for?: string[];
    tillval_via_paket?: string;
    tillval_pris?: number;
  }>;

  tillval_paket?: Array<{
    name: string;
    description?: string;
    pris?: number;
    available_for_trims?: string[];
    innehall?: string[];
  }>;

  tillval_farger?: Array<{
    name: string;
    color_code?: string;
    color_type?: 'solid' | 'metallic' | 'pearl' | 'matte';
    pris?: number;
    is_standard?: boolean;
    available_for_trims?: string[];
  }>;

  tillval_falgar?: Array<{
    name: string;
    size?: string;
    style?: string;
    pris?: number;
    standard_for?: string[];
    tillval_for?: string[];
  }>;

  tillval_interior?: Array<{
    name: string;
    material?: string;
    color?: string;
    pris?: number;
    standard_for?: string[];
    tillval_for?: string[];
  }>;

  garanti?: {
    nybilsgaranti?: string;
    vagassistans?: string;
    rostgaranti?: string;
    batterigaranti?: string;
    lackgaranti?: string;
    service_interval?: string;
  };

  variants: Array<{
    name: string;
    trim: string;
    motor: string;
    drivlina?: string;
    is_plus_variant?: boolean;
    base_variant?: string;
    included_packages?: string[];
    pris?: number;
    old_pris?: number;
    privatleasing?: number;
    old_privatleasing?: number;
    foretagsleasing?: number;
    old_foretagsleasing?: number;
    billan_per_man?: number;
    old_billan_per_man?: number;
    leasing_months?: number;
    leasing_km_per_year?: number;
    leasing_deposit?: number;
  }>;
}
