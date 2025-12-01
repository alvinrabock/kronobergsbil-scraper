// lib/payload-deduplication.ts - Fixed with proper null checks
export interface ExistingRecord {
    id: string;
    title: string;
    brand?: string;
    vehicle_model?: Array<{
      name: string;
      price?: number;
    }>;
    updatedAt: string;
  }
  
  export interface MatchResult {
    found: boolean;
    record?: ExistingRecord;
    matchScore: number;
    matchReason: string;
  }
  
  // Enhanced matching algorithms
  export function findMatchingFordon(newVehicle: any, existingRecords: ExistingRecord[]): MatchResult {
    let bestMatch: MatchResult = { found: false, matchScore: 0, matchReason: 'No match found' };
  
    // FIXED: Add safety checks
    if (!newVehicle || !newVehicle.title) {
      console.warn('⚠️ newVehicle or newVehicle.title is missing:', newVehicle);
      return bestMatch;
    }
  
    if (!existingRecords || existingRecords.length === 0) {
      console.warn('⚠️ No existing records to compare against');
      return bestMatch;
    }
  
    for (const existing of existingRecords) {
      // FIXED: Skip records with missing title
      if (!existing || !existing.title) {
        console.warn('⚠️ Skipping existing record with missing title:', existing);
        continue;
      }
  
      const score = calculateVehicleMatchScore(newVehicle, existing);
      
      if (score.total >= 0.8 && score.total > bestMatch.matchScore) {
        bestMatch = {
          found: true,
          record: existing,
          matchScore: score.total,
          matchReason: score.reasons.join(', ')
        };
      }
    }
  
    return bestMatch;
  }
  
  export function calculateVehicleMatchScore(newVehicle: any, existing: ExistingRecord) {
    const reasons: string[] = [];
    let totalScore = 0;
    let maxScore = 0;
  
    // FIXED: Add safety checks for titles
    if (!newVehicle?.title || !existing?.title) {
      console.warn('⚠️ Missing title in match calculation:', { 
        newTitle: newVehicle?.title, 
        existingTitle: existing?.title 
      });
      return {
        total: 0,
        titleScore: 0,
        reasons: ['Missing title data']
      };
    }
  
    // Title similarity (high weight)
    const titleWeight = 0.4;
    maxScore += titleWeight;
    const titleSimilarity = calculateStringSimilarity(
      normalizeVehicleName(newVehicle.title), 
      normalizeVehicleName(existing.title)
    );
    const titleScore = titleSimilarity * titleWeight;
    totalScore += titleScore;
    
    if (titleSimilarity > 0.8) {
      reasons.push(`Title match: ${(titleSimilarity * 100).toFixed(0)}%`);
    }
  
    // Brand match (medium weight)
    const brandWeight = 0.3;
    maxScore += brandWeight;
    if (newVehicle.brand && existing.brand) {
      const brandMatch = normalizeString(newVehicle.brand) === normalizeString(existing.brand);
      if (brandMatch) {
        totalScore += brandWeight;
        reasons.push('Same brand');
      }
    }
  
    // Vehicle model overlap (medium weight)
    const modelWeight = 0.3;
    maxScore += modelWeight;
    if (newVehicle.vehicle_model && existing.vehicle_model) {
      const modelOverlap = calculateModelOverlap(newVehicle.vehicle_model, existing.vehicle_model);
      const modelScore = modelOverlap * modelWeight;
      totalScore += modelScore;
      
      if (modelOverlap > 0.5) {
        reasons.push(`Model overlap: ${(modelOverlap * 100).toFixed(0)}%`);
      }
    }
  
    return {
      total: totalScore / maxScore,
      titleScore: titleSimilarity,
      reasons
    };
  }
  
  function normalizeVehicleName(name: string): string {
    // FIXED: Add null/undefined checks
    if (!name || typeof name !== 'string') {
      console.warn('⚠️ normalizeVehicleName received invalid input:', name);
      return '';
    }
  
    return name
      .toLowerCase()
      .replace(/\b(nya|new|2024|2025)\b/g, '') // Remove "new" indicators
      .replace(/\b(elektrisk|electric|hybrid|plug-in)\b/g, '') // Remove powertrain types
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function normalizeString(str: string): string {
    // FIXED: Add null/undefined checks
    if (!str || typeof str !== 'string') {
      return '';
    }
    return str.toLowerCase().trim();
  }
  
  function calculateStringSimilarity(str1: string, str2: string): number {
    // FIXED: Handle empty/null strings
    if (!str1 && !str2) return 1; // Both empty = perfect match
    if (!str1 || !str2) return 0; // One empty = no match
  
    // Levenshtein distance based similarity
    const distance = levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }
  
  function levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  function calculateModelOverlap(newModels: any[], existingModels: any[]): number {
    if (!newModels?.length || !existingModels?.length) return 0;
  
    let matchCount = 0;
    for (const newModel of newModels) {
      // FIXED: Check if model has name
      if (!newModel?.name) continue;
      
      const normalizedNewName = normalizeVehicleName(newModel.name);
      
      for (const existingModel of existingModels) {
        // FIXED: Check if existing model has name
        if (!existingModel?.name) continue;
        
        const normalizedExistingName = normalizeVehicleName(existingModel.name);
        const similarity = calculateStringSimilarity(normalizedNewName, normalizedExistingName);
        
        if (similarity > 0.8) {
          matchCount++;
          break; // Found a match for this model
        }
      }
    }
  
    return matchCount / Math.max(newModels.length, existingModels.length);
  }
  
  // Smart merging functions
  export function mergeVehicleData(existingVehicle: any, newVehicle: any): any {
    // FIXED: Add safety checks
    if (!existingVehicle) {
      console.warn('⚠️ No existing vehicle data to merge with');
      return newVehicle || {};
    }
  
    if (!newVehicle) {
      console.warn('⚠️ No new vehicle data to merge');
      return existingVehicle;
    }
  
    const merged = { ...existingVehicle };
  
    // Update title if new one is more descriptive
    if (newVehicle.title && (!existingVehicle.title || newVehicle.title.length > existingVehicle.title.length)) {
      merged.title = newVehicle.title;
    }
  
    // Update description if new one exists and is longer
    if (newVehicle.description && 
        (!existingVehicle.description || newVehicle.description.length > existingVehicle.description.length)) {
      merged.description = newVehicle.description;
    }
  
    // Update brand if new one exists
    if (newVehicle.brand && (!existingVehicle.brand || newVehicle.brand.length > existingVehicle.brand.length)) {
      merged.brand = newVehicle.brand;
    }
  
    // Update thumbnail if new one exists and current one is generic or missing
    if (newVehicle.thumbnail && 
        (!existingVehicle.thumbnail || 
         existingVehicle.thumbnail.includes('generic') || 
         existingVehicle.thumbnail.includes('placeholder'))) {
      merged.thumbnail = newVehicle.thumbnail;
    }
  
    // Merge vehicle models intelligently
    if (newVehicle.vehicle_model && Array.isArray(newVehicle.vehicle_model)) {
      merged.vehicle_model = mergeVehicleModels(
        existingVehicle.vehicle_model || [], 
        newVehicle.vehicle_model
      );
    }
  
    // Update free text if new one is more comprehensive
    if (newVehicle.free_text && 
        (!existingVehicle.free_text || newVehicle.free_text.length > existingVehicle.free_text.length)) {
      merged.free_text = newVehicle.free_text;
    }
  
    return merged;
  }
  
  function mergeVehicleModels(existingModels: any[], newModels: any[]): any[] {
    const merged = [...(existingModels || [])];
  
    if (!newModels || !Array.isArray(newModels)) {
      return merged;
    }
  
    for (const newModel of newModels) {
      if (!newModel?.name) continue; // Skip models without names
      
      let found = false;
      
      // Try to find matching existing model
      for (let i = 0; i < merged.length; i++) {
        if (!merged[i]?.name) continue; // Skip existing models without names
        
        const similarity = calculateStringSimilarity(
          normalizeVehicleName(merged[i].name),
          normalizeVehicleName(newModel.name)
        );
        
        if (similarity > 0.8) {
          // Update existing model with new data
          merged[i] = mergeVehicleModelData(merged[i], newModel);
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Add as new model variant
        merged.push(newModel);
      }
    }
  
    return merged;
  }
  
  function mergeVehicleModelData(existingModel: any, newModel: any): any {
    const merged = { ...existingModel };
  
    // Update price if new price exists and is different
    if (newModel.price && newModel.price > 0) {
      merged.price = newModel.price;
    }
  
    // Update old_price if it exists in new model
    if (newModel.old_price && newModel.old_price > 0) {
      merged.old_price = newModel.old_price;
    }
  
    // Update thumbnail if new one is better
    if (newModel.thumbnail && 
        (!existingModel.thumbnail || 
         existingModel.thumbnail.includes('generic') ||
         newModel.thumbnail.length > existingModel.thumbnail.length)) {
      merged.thumbnail = newModel.thumbnail;
    }
  
    // Merge financing options
    if (newModel.financing_options) {
      merged.financing_options = mergeFinancingOptions(
        existingModel.financing_options || {},
        newModel.financing_options
      );
    }
  
    return merged;
  }
  
  function mergeFinancingOptions(existing: any, newOptions: any): any {
    const merged = { ...existing };
  
    if (!newOptions) return merged;
  
    ['privatleasing', 'company_leasing', 'loan'].forEach(type => {
      if (newOptions[type] && Array.isArray(newOptions[type]) && newOptions[type].length > 0) {
        if (!merged[type] || merged[type].length === 0) {
          // Use new options if existing is empty
          merged[type] = newOptions[type];
        } else {
          // Merge arrays, avoiding duplicates
          merged[type] = mergeFinancingOptionsArray(merged[type], newOptions[type]);
        }
      }
    });
  
    return merged;
  }
  
  function mergeFinancingOptionsArray(existing: any[], newOptions: any[]): any[] {
    const merged = [...existing];
  
    if (!newOptions || !Array.isArray(newOptions)) {
      return merged;
    }
  
    for (const newOption of newOptions) {
      if (!newOption) continue;
      
      // Check if similar option already exists
      const similarIndex = merged.findIndex(existingOption => {
        const priceDiff = Math.abs(
          (existingOption?.monthly_price || 0) - (newOption?.monthly_price || 0)
        );
        const periodMatch = existingOption?.period_months === newOption?.period_months;
        
        return priceDiff < 50 && (periodMatch || (!existingOption?.period_months && !newOption?.period_months));
      });
  
      if (similarIndex >= 0) {
        // Update existing option with more complete data
        merged[similarIndex] = {
          ...merged[similarIndex],
          ...newOption,
          // Preserve non-null existing values
          ...Object.keys(merged[similarIndex] || {}).reduce((acc, key) => {
            if (merged[similarIndex][key] !== null && merged[similarIndex][key] !== undefined) {
              acc[key] = merged[similarIndex][key];
            }
            return acc;
          }, {} as any)
        };
      } else {
        // Add as new option
        merged.push(newOption);
      }
    }
  
    return merged;
  }
  
  // Campaign matching (similar logic)
  export function findMatchingCampaign(newCampaign: any, existingCampaigns: ExistingRecord[]): MatchResult {
    let bestMatch: MatchResult = { found: false, matchScore: 0, matchReason: 'No match found' };
  
    // FIXED: Add safety checks
    if (!newCampaign?.title || !existingCampaigns?.length) {
      return bestMatch;
    }
  
    for (const existing of existingCampaigns) {
      if (!existing?.title) continue;
      
      const titleSimilarity = calculateStringSimilarity(
        normalizeString(newCampaign.title),
        normalizeString(existing.title)
      );
      
      if (titleSimilarity > 0.8 && titleSimilarity > bestMatch.matchScore) {
        bestMatch = {
          found: true,
          record: existing,
          matchScore: titleSimilarity,
          matchReason: `Title similarity: ${(titleSimilarity * 100).toFixed(0)}%`
        };
      }
    }
  
    return bestMatch;
  }