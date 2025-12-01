// Database types for Supabase tables

export interface Database {
  public: {
    Tables: {
      scrape_sessions: {
        Row: {
          id: string
          user_id: string | null
          url: string
          status: 'pending' | 'processing' | 'completed' | 'failed'
          created_at: string
          updated_at: string
          completed_at: string | null
          error_message: string | null
          page_title: string | null
          page_description: string | null
          content_length: number | null
          links_found: number
          links_fetched: number
          content_type: 'campaigns' | 'cars' | 'transport_cars' | null
          total_items: number
          success_items: number
          failed_items: number
        }
        Insert: {
          id?: string
          user_id?: string | null
          url: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          error_message?: string | null
          page_title?: string | null
          page_description?: string | null
          content_length?: number | null
          links_found?: number
          links_fetched?: number
          content_type?: 'campaigns' | 'cars' | 'transport_cars' | null
          total_items?: number
          success_items?: number
          failed_items?: number
        }
        Update: {
          id?: string
          user_id?: string | null
          url?: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          error_message?: string | null
          page_title?: string | null
          page_description?: string | null
          content_length?: number | null
          links_found?: number
          links_fetched?: number
          content_type?: 'campaigns' | 'cars' | 'transport_cars' | null
          total_items?: number
          success_items?: number
          failed_items?: number
        }
      }
      scraped_content: {
        Row: {
          id: string
          session_id: string
          url: string
          title: string | null
          cleaned_html: string | null
          raw_html: string | null
          thumbnail_url: string | null
          created_at: string
          price: string | null
          year: string | null
          mileage: string | null
          content: string | null
          // PDF tracking fields
          pdf_links_found: string[] | null
          pdf_processing_status: 'not_found' | 'pending' | 'success' | 'failed' | 'partial' | null
          pdf_success_count: number | null
          pdf_total_count: number | null
          pdf_extracted_content: string | null
          pdf_processing_errors: string[] | null
          pdf_processing_time_ms: number | null
          pdf_last_attempted: string | null
          pdf_metadata: any | null
          pdf_file_hashes: string[] | null
          pdf_retry_count: number
          pdf_last_retry_at: string | null
          pdf_retryable_failures: string[] | null
        }
        Insert: {
          id?: string
          session_id: string
          url: string
          title?: string | null
          cleaned_html?: string | null
          raw_html?: string | null
          thumbnail_url?: string | null
          created_at?: string
          price?: string | null
          year?: string | null
          mileage?: string | null
          content?: string | null
          // PDF tracking fields
          pdf_links_found?: string[] | null
          pdf_processing_status?: 'not_found' | 'pending' | 'success' | 'failed' | 'partial' | null
          pdf_success_count?: number | null
          pdf_total_count?: number | null
          pdf_extracted_content?: string | null
          pdf_processing_errors?: string[] | null
          pdf_processing_time_ms?: number | null
          pdf_last_attempted?: string | null
          pdf_metadata?: any | null
          pdf_file_hashes?: string[] | null
          pdf_retry_count?: number
          pdf_last_retry_at?: string | null
          pdf_retryable_failures?: string[] | null
        }
        Update: {
          id?: string
          session_id?: string
          url?: string
          title?: string | null
          cleaned_html?: string | null
          raw_html?: string | null
          thumbnail_url?: string | null
          created_at?: string
          price?: string | null
          year?: string | null
          mileage?: string | null
          content?: string | null
          // PDF tracking fields
          pdf_links_found?: string[] | null
          pdf_processing_status?: 'not_found' | 'pending' | 'success' | 'failed' | 'partial' | null
          pdf_success_count?: number | null
          pdf_total_count?: number | null
          pdf_extracted_content?: string | null
          pdf_processing_errors?: string[] | null
          pdf_processing_time_ms?: number | null
          pdf_last_attempted?: string | null
          pdf_metadata?: any | null
          pdf_file_hashes?: string[] | null
          pdf_retry_count?: number
          pdf_last_retry_at?: string | null
          pdf_retryable_failures?: string[] | null
        }
      }
      ai_processed_results: {
        Row: {
          id: string
          session_id: string
          scraped_content_id: string | null
          content_type: 'campaigns' | 'cars' | 'transport_cars'
          success: boolean
          created_at: string
          token_usage: any | null
          processing_time_ms: number | null
          model_used: string | null
          fact_check_score: number | null
          fact_check_confidence: 'high' | 'medium' | 'low' | null
          fact_check_issues: any | null
          verified_fields: string[] | null
          error_message: string | null
          total_estimated_cost_usd: number | null
          api_calls: any | null
          pdf_processing: any | null
          debug_info: any | null
        }
        Insert: {
          id?: string
          session_id: string
          scraped_content_id?: string | null
          content_type: 'campaigns' | 'cars' | 'transport_cars'
          success?: boolean
          created_at?: string
          token_usage?: any | null
          processing_time_ms?: number | null
          model_used?: string | null
          fact_check_score?: number | null
          fact_check_confidence?: 'high' | 'medium' | 'low' | null
          fact_check_issues?: any | null
          verified_fields?: string[] | null
          error_message?: string | null
          total_estimated_cost_usd?: number | null
          api_calls?: any | null
          pdf_processing?: any | null
          debug_info?: any | null
        }
        Update: {
          id?: string
          session_id?: string
          scraped_content_id?: string | null
          content_type?: 'campaigns' | 'cars' | 'transport_cars'
          success?: boolean
          created_at?: string
          token_usage?: any | null
          processing_time_ms?: number | null
          model_used?: string | null
          fact_check_score?: number | null
          fact_check_confidence?: 'high' | 'medium' | 'low' | null
          fact_check_issues?: any | null
          verified_fields?: string[] | null
          error_message?: string | null
          total_estimated_cost_usd?: number | null
          api_calls?: any | null
          pdf_processing?: any | null
          debug_info?: any | null
        }
      }
      campaigns: {
        Row: {
          id: string
          ai_result_id: string | null
          session_id: string
          title: string
          description: string | null
          content: string | null
          thumbnail_url: string | null
          brand: string | null
          campaign_start: string | null
          campaign_end: string | null
          free_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ai_result_id?: string | null
          session_id: string
          title: string
          description?: string | null
          content?: string | null
          thumbnail_url?: string | null
          brand?: string | null
          campaign_start?: string | null
          campaign_end?: string | null
          free_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ai_result_id?: string | null
          session_id?: string
          title?: string
          description?: string | null
          content?: string | null
          thumbnail_url?: string | null
          brand?: string | null
          campaign_start?: string | null
          campaign_end?: string | null
          free_text?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vehicles: {
        Row: {
          id: string
          ai_result_id: string | null
          session_id: string
          title: string
          brand: string | null
          description: string | null
          thumbnail_url: string | null
          vehicle_type: 'cars' | 'transport_cars'
          free_text: string | null
          pdf_source_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ai_result_id?: string | null
          session_id: string
          title: string
          brand?: string | null
          description?: string | null
          thumbnail_url?: string | null
          vehicle_type: 'cars' | 'transport_cars'
          free_text?: string | null
          pdf_source_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ai_result_id?: string | null
          session_id?: string
          title?: string
          brand?: string | null
          description?: string | null
          thumbnail_url?: string | null
          vehicle_type?: 'cars' | 'transport_cars'
          free_text?: string | null
          pdf_source_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      campaign_vehicle_models: {
        Row: {
          id: string
          campaign_id: string
          name: string
          price: number | null
          old_price: number | null
          privatleasing: number | null
          company_leasing_price: number | null
          loan_price: number | null
          thumbnail_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          name: string
          price?: number | null
          old_price?: number | null
          privatleasing?: number | null
          company_leasing_price?: number | null
          loan_price?: number | null
          thumbnail_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          name?: string
          price?: number | null
          old_price?: number | null
          privatleasing?: number | null
          company_leasing_price?: number | null
          loan_price?: number | null
          thumbnail_url?: string | null
          created_at?: string
        }
      }
      vehicle_models: {
        Row: {
          id: string
          vehicle_id: string
          name: string
          price: number | null
          old_price: number | null
          privatleasing: number | null
          company_leasing_price: number | null
          loan_price: number | null
          thumbnail_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          name: string
          price?: number | null
          old_price?: number | null
          privatleasing?: number | null
          company_leasing_price?: number | null
          loan_price?: number | null
          thumbnail_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          name?: string
          price?: number | null
          old_price?: number | null
          privatleasing?: number | null
          company_leasing_price?: number | null
          loan_price?: number | null
          thumbnail_url?: string | null
          created_at?: string
        }
      }
      saved_links: {
        Row: {
          id: string
          user_id: string
          url: string
          label: string
          content_type: 'campaigns' | 'cars' | 'transport_cars'
          brand: string | null
          car_type: string | null
          description: string | null
          created_at: string
          updated_at: string
          last_scraped: string | null
          scrape_count: number
          is_active: boolean
          total_cost_usd: number | null
          avg_cost_per_scrape: number | null
          last_scrape_cost: number | null
        }
        Insert: {
          id?: string
          user_id: string
          url: string
          label: string
          content_type: 'campaigns' | 'cars' | 'transport_cars'
          brand?: string | null
          car_type?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_scraped?: string | null
          scrape_count?: number
          is_active?: boolean
          total_cost_usd?: number | null
          avg_cost_per_scrape?: number | null
          last_scrape_cost?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          url?: string
          label?: string
          content_type?: 'campaigns' | 'cars' | 'transport_cars'
          brand?: string | null
          car_type?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_scraped?: string | null
          scrape_count?: number
          is_active?: boolean
          total_cost_usd?: number | null
          avg_cost_per_scrape?: number | null
          last_scrape_cost?: number | null
        }
      }
    }
  }
}