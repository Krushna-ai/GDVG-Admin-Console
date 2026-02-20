export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          api_name: string
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          method: string | null
          rate_limited: boolean | null
          request_metadata: Json | null
          response_time_ms: number | null
          retry_count: number | null
          status_code: number | null
        }
        Insert: {
          api_name: string
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          method?: string | null
          rate_limited?: boolean | null
          request_metadata?: Json | null
          response_time_ms?: number | null
          retry_count?: number | null
          status_code?: number | null
        }
        Update: {
          api_name?: string
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          method?: string | null
          rate_limited?: boolean | null
          request_metadata?: Json | null
          response_time_ms?: number | null
          retry_count?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      awards: {
        Row: {
          award_name: string
          category: string | null
          content_id: string | null
          created_at: string | null
          id: string
          person_id: string | null
          source: string | null
          wikidata_award_id: string | null
          won: boolean
          year: number | null
        }
        Insert: {
          award_name: string
          category?: string | null
          content_id?: string | null
          created_at?: string | null
          id?: string
          person_id?: string | null
          source?: string | null
          wikidata_award_id?: string | null
          won?: boolean
          year?: number | null
        }
        Update: {
          award_name?: string
          category?: string | null
          content_id?: string | null
          created_at?: string | null
          id?: string
          person_id?: string | null
          source?: string | null
          wikidata_award_id?: string | null
          won?: boolean
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          backdrop_path: string | null
          created_at: string | null
          id: string
          name: string
          overview: string | null
          parts: Json | null
          poster_path: string | null
          tmdb_id: number
          updated_at: string | null
        }
        Insert: {
          backdrop_path?: string | null
          created_at?: string | null
          id?: string
          name: string
          overview?: string | null
          parts?: Json | null
          poster_path?: string | null
          tmdb_id: number
          updated_at?: string | null
        }
        Update: {
          backdrop_path?: string | null
          created_at?: string | null
          id?: string
          name?: string
          overview?: string | null
          parts?: Json | null
          poster_path?: string | null
          tmdb_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      content: {
        Row: {
          aggregate_credits: Json | null
          alternative_titles: Json | null
          backdrop_path: string | null
          based_on: string | null
          belongs_to_collection: Json | null
          box_office: number | null
          budget: number | null
          collection_id: string | null
          content_rating: string | null
          content_type: string
          created_at: string | null
          enriched_at: string | null
          enrichment_cycle: number | null
          external_ids: Json | null
          filming_location: string | null
          first_air_date: string | null
          gdvg_id: number | null
          genres: Json | null
          homepage: string | null
          id: string
          images: Json | null
          imdb_id: string | null
          import_batch_id: string | null
          import_batch_name: string | null
          imported_at: string | null
          in_production: boolean | null
          keywords: Json | null
          last_air_date: string | null
          main_poster: string | null
          narrative_location: string | null
          networks: Json | null
          number_of_episodes: number | null
          number_of_seasons: number | null
          origin_country: string[] | null
          original_language: string | null
          original_network: string | null
          original_title: string | null
          overview: string | null
          overview_source: string | null
          popularity: number | null
          poster_path: string | null
          production_companies: Json | null
          production_countries: Json | null
          recommendations: Json | null
          region: string | null
          release_date: string | null
          release_dates: Json | null
          revenue: number | null
          review_score_mc: string | null
          review_score_rt: string | null
          reviews_tmdb: Json | null
          runtime: number | null
          screenwriters: Json | null
          similar_content: Json | null
          social_ids: Json | null
          spoken_languages: Json | null
          status: string | null
          tagline: string | null
          title: string
          tmdb_id: number
          tmdb_status: string | null
          translations: Json | null
          tvdb_id: number | null
          updated_at: string | null
          videos: Json | null
          vote_average: number | null
          vote_count: number | null
          watch_providers: Json | null
          wiki_accolades: string | null
          wiki_cast_notes: string | null
          wiki_episode_guide: string | null
          wiki_plot: string | null
          wiki_production: string | null
          wiki_reception: string | null
          wiki_release: string | null
          wiki_soundtrack: string | null
          wiki_synopsis: string | null
          wikidata_id: string | null
          wikipedia_url: string | null
        }
        Insert: {
          aggregate_credits?: Json | null
          alternative_titles?: Json | null
          backdrop_path?: string | null
          based_on?: string | null
          belongs_to_collection?: Json | null
          box_office?: number | null
          budget?: number | null
          collection_id?: string | null
          content_rating?: string | null
          content_type: string
          created_at?: string | null
          enriched_at?: string | null
          enrichment_cycle?: number | null
          external_ids?: Json | null
          filming_location?: string | null
          first_air_date?: string | null
          gdvg_id?: number | null
          genres?: Json | null
          homepage?: string | null
          id?: string
          images?: Json | null
          imdb_id?: string | null
          import_batch_id?: string | null
          import_batch_name?: string | null
          imported_at?: string | null
          in_production?: boolean | null
          keywords?: Json | null
          last_air_date?: string | null
          main_poster?: string | null
          narrative_location?: string | null
          networks?: Json | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          origin_country?: string[] | null
          original_language?: string | null
          original_network?: string | null
          original_title?: string | null
          overview?: string | null
          overview_source?: string | null
          popularity?: number | null
          poster_path?: string | null
          production_companies?: Json | null
          production_countries?: Json | null
          recommendations?: Json | null
          region?: string | null
          release_date?: string | null
          release_dates?: Json | null
          revenue?: number | null
          review_score_mc?: string | null
          review_score_rt?: string | null
          reviews_tmdb?: Json | null
          runtime?: number | null
          screenwriters?: Json | null
          similar_content?: Json | null
          social_ids?: Json | null
          spoken_languages?: Json | null
          status?: string | null
          tagline?: string | null
          title: string
          tmdb_id: number
          tmdb_status?: string | null
          translations?: Json | null
          tvdb_id?: number | null
          updated_at?: string | null
          videos?: Json | null
          vote_average?: number | null
          vote_count?: number | null
          watch_providers?: Json | null
          wiki_accolades?: string | null
          wiki_cast_notes?: string | null
          wiki_episode_guide?: string | null
          wiki_plot?: string | null
          wiki_production?: string | null
          wiki_reception?: string | null
          wiki_release?: string | null
          wiki_soundtrack?: string | null
          wiki_synopsis?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          aggregate_credits?: Json | null
          alternative_titles?: Json | null
          backdrop_path?: string | null
          based_on?: string | null
          belongs_to_collection?: Json | null
          box_office?: number | null
          budget?: number | null
          collection_id?: string | null
          content_rating?: string | null
          content_type?: string
          created_at?: string | null
          enriched_at?: string | null
          enrichment_cycle?: number | null
          external_ids?: Json | null
          filming_location?: string | null
          first_air_date?: string | null
          gdvg_id?: number | null
          genres?: Json | null
          homepage?: string | null
          id?: string
          images?: Json | null
          imdb_id?: string | null
          import_batch_id?: string | null
          import_batch_name?: string | null
          imported_at?: string | null
          in_production?: boolean | null
          keywords?: Json | null
          last_air_date?: string | null
          main_poster?: string | null
          narrative_location?: string | null
          networks?: Json | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          origin_country?: string[] | null
          original_language?: string | null
          original_network?: string | null
          original_title?: string | null
          overview?: string | null
          overview_source?: string | null
          popularity?: number | null
          poster_path?: string | null
          production_companies?: Json | null
          production_countries?: Json | null
          recommendations?: Json | null
          region?: string | null
          release_date?: string | null
          release_dates?: Json | null
          revenue?: number | null
          review_score_mc?: string | null
          review_score_rt?: string | null
          reviews_tmdb?: Json | null
          runtime?: number | null
          screenwriters?: Json | null
          similar_content?: Json | null
          social_ids?: Json | null
          spoken_languages?: Json | null
          status?: string | null
          tagline?: string | null
          title?: string
          tmdb_id?: number
          tmdb_status?: string | null
          translations?: Json | null
          tvdb_id?: number | null
          updated_at?: string | null
          videos?: Json | null
          vote_average?: number | null
          vote_count?: number | null
          watch_providers?: Json | null
          wiki_accolades?: string | null
          wiki_cast_notes?: string | null
          wiki_episode_guide?: string | null
          wiki_plot?: string | null
          wiki_production?: string | null
          wiki_reception?: string | null
          wiki_release?: string | null
          wiki_soundtrack?: string | null
          wiki_synopsis?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      content_cast: {
        Row: {
          character_name: string | null
          content_id: string
          created_at: string | null
          id: string
          order_index: number | null
          person_id: string
          role_type: string | null
        }
        Insert: {
          character_name?: string | null
          content_id: string
          created_at?: string | null
          id?: string
          order_index?: number | null
          person_id: string
          role_type?: string | null
        }
        Update: {
          character_name?: string | null
          content_id?: string
          created_at?: string | null
          id?: string
          order_index?: number | null
          person_id?: string
          role_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_cast_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cast_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      content_crew: {
        Row: {
          content_id: string
          created_at: string | null
          department: string | null
          id: string
          job: string
          person_id: string
        }
        Insert: {
          content_id: string
          created_at?: string | null
          department?: string | null
          id?: string
          job: string
          person_id: string
        }
        Update: {
          content_id?: string
          created_at?: string | null
          department?: string | null
          id?: string
          job?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_crew_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_crew_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      content_watch_links: {
        Row: {
          content_id: string
          created_at: string | null
          id: string
          is_affiliate: boolean | null
          link_url: string
          platform_name: string
          priority: number | null
          region: string | null
          updated_at: string | null
        }
        Insert: {
          content_id: string
          created_at?: string | null
          id?: string
          is_affiliate?: boolean | null
          link_url: string
          platform_name: string
          priority?: number | null
          region?: string | null
          updated_at?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string | null
          id?: string
          is_affiliate?: boolean | null
          link_url?: string
          platform_name?: string
          priority?: number | null
          region?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_watch_links_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          body: string
          created_at: string | null
          drama_id: string
          id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          drama_id: string
          id?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          drama_id?: string
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussions_drama_id_fkey"
            columns: ["drama_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_cycles: {
        Row: {
          current_cycle: number | null
          cycle_completed_at: string | null
          cycle_started_at: string | null
          entity_type: string
          id: number
          items_completed: number | null
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          current_cycle?: number | null
          cycle_completed_at?: string | null
          cycle_started_at?: string | null
          entity_type: string
          id?: number
          items_completed?: number | null
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          current_cycle?: number | null
          cycle_completed_at?: string | null
          cycle_started_at?: string | null
          entity_type?: string
          id?: number
          items_completed?: number | null
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      enrichment_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          entity_id: string | null
          error_message: string | null
          id: string
          max_retries: number | null
          metadata: Json | null
          priority: number | null
          queue_type: string
          retry_count: number | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          metadata?: Json | null
          priority?: number | null
          queue_type: string
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          metadata?: Json | null
          priority?: number | null
          queue_type?: string
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      episodes: {
        Row: {
          air_date: string | null
          content_id: string
          created_at: string | null
          crew: Json | null
          episode_number: number
          episode_type: string | null
          guest_stars: Json | null
          id: string
          name: string | null
          overview: string | null
          production_code: string | null
          runtime: number | null
          season_id: string
          season_number: number
          still_path: string | null
          tmdb_id: number
          updated_at: string | null
          vote_average: number | null
          vote_count: number | null
        }
        Insert: {
          air_date?: string | null
          content_id: string
          created_at?: string | null
          crew?: Json | null
          episode_number: number
          episode_type?: string | null
          guest_stars?: Json | null
          id?: string
          name?: string | null
          overview?: string | null
          production_code?: string | null
          runtime?: number | null
          season_id: string
          season_number: number
          still_path?: string | null
          tmdb_id: number
          updated_at?: string | null
          vote_average?: number | null
          vote_count?: number | null
        }
        Update: {
          air_date?: string | null
          content_id?: string
          created_at?: string | null
          crew?: Json | null
          episode_number?: number
          episode_type?: string | null
          guest_stars?: Json | null
          id?: string
          name?: string | null
          overview?: string | null
          production_code?: string | null
          runtime?: number | null
          season_id?: string
          season_number?: number
          still_path?: string | null
          tmdb_id?: number
          updated_at?: string | null
          vote_average?: number | null
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          drama_id: string
          id: number
          progress: number | null
          score: number | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          drama_id: string
          id?: number
          progress?: number | null
          score?: number | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          drama_id?: string
          id?: number
          progress?: number | null
          score?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_drama_id_fkey"
            columns: ["drama_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          configuration: Json
          created_at: string | null
          created_by: string | null
          error_log: string[] | null
          id: string
          name: string
          priority: number | null
          progress: Json | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          configuration: Json
          created_at?: string | null
          created_by?: string | null
          error_log?: string[] | null
          id?: string
          name: string
          priority?: number | null
          progress?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          configuration?: Json
          created_at?: string | null
          created_by?: string | null
          error_log?: string[] | null
          id?: string
          name?: string
          priority?: number | null
          progress?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      import_presets: {
        Row: {
          configuration: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          last_used_at: string | null
          name: string
          use_count: number | null
        }
        Insert: {
          configuration: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          use_count?: number | null
        }
        Update: {
          configuration?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          use_count?: number | null
        }
        Relationships: []
      }
      import_queue: {
        Row: {
          attempts: number | null
          batch_name: string | null
          content_type: string
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          priority: number | null
          processed_at: string | null
          release_month: number | null
          release_year: number | null
          source: string | null
          status: string | null
          tmdb_id: number
        }
        Insert: {
          attempts?: number | null
          batch_name?: string | null
          content_type: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          processed_at?: string | null
          release_month?: number | null
          release_year?: number | null
          source?: string | null
          status?: string | null
          tmdb_id: number
        }
        Update: {
          attempts?: number | null
          batch_name?: string | null
          content_type?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          processed_at?: string | null
          release_month?: number | null
          release_year?: number | null
          source?: string | null
          status?: string | null
          tmdb_id?: number
        }
        Relationships: []
      }
      people: {
        Row: {
          adult: boolean | null
          also_known_as: string[] | null
          bio_source: string | null
          biography: string | null
          birthday: string | null
          combined_credits_count: number | null
          created_at: string | null
          deathday: string | null
          enriched_at: string | null
          enrichment_cycle: number | null
          external_ids: Json | null
          gdvg_id: number | null
          gender: number | null
          height_cm: number | null
          homepage: string | null
          id: string
          images: Json | null
          imdb_id: string | null
          import_batch_id: string | null
          import_batch_name: string | null
          imported_at: string | null
          instagram: string | null
          known_for_department: string | null
          main_profile_photo: string | null
          name: string
          native_name: string | null
          place_of_birth: string | null
          popularity: number | null
          profile_path: string | null
          social_ids: Json | null
          tiktok: string | null
          tmdb_id: number
          twitter: string | null
          updated_at: string | null
          wikidata_id: string | null
          wikipedia_url: string | null
        }
        Insert: {
          adult?: boolean | null
          also_known_as?: string[] | null
          bio_source?: string | null
          biography?: string | null
          birthday?: string | null
          combined_credits_count?: number | null
          created_at?: string | null
          deathday?: string | null
          enriched_at?: string | null
          enrichment_cycle?: number | null
          external_ids?: Json | null
          gdvg_id?: number | null
          gender?: number | null
          height_cm?: number | null
          homepage?: string | null
          id?: string
          images?: Json | null
          imdb_id?: string | null
          import_batch_id?: string | null
          import_batch_name?: string | null
          imported_at?: string | null
          instagram?: string | null
          known_for_department?: string | null
          main_profile_photo?: string | null
          name: string
          native_name?: string | null
          place_of_birth?: string | null
          popularity?: number | null
          profile_path?: string | null
          social_ids?: Json | null
          tiktok?: string | null
          tmdb_id: number
          twitter?: string | null
          updated_at?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          adult?: boolean | null
          also_known_as?: string[] | null
          bio_source?: string | null
          biography?: string | null
          birthday?: string | null
          combined_credits_count?: number | null
          created_at?: string | null
          deathday?: string | null
          enriched_at?: string | null
          enrichment_cycle?: number | null
          external_ids?: Json | null
          gdvg_id?: number | null
          gender?: number | null
          height_cm?: number | null
          homepage?: string | null
          id?: string
          images?: Json | null
          imdb_id?: string | null
          import_batch_id?: string | null
          import_batch_name?: string | null
          imported_at?: string | null
          instagram?: string | null
          known_for_department?: string | null
          main_profile_photo?: string | null
          name?: string
          native_name?: string | null
          place_of_birth?: string | null
          popularity?: number | null
          profile_path?: string | null
          social_ids?: Json | null
          tiktok?: string | null
          tmdb_id?: number
          twitter?: string | null
          updated_at?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Relationships: []
      }
      quality_reports: {
        Row: {
          created_at: string
          id: string
          issues_by_field: Json
          priority_items: Json
          report_type: string
          total_checked: number
          total_complete: number
          total_issues: number
        }
        Insert: {
          created_at?: string
          id?: string
          issues_by_field?: Json
          priority_items?: Json
          report_type: string
          total_checked: number
          total_complete: number
          total_issues: number
        }
        Update: {
          created_at?: string
          id?: string
          issues_by_field?: Json
          priority_items?: Json
          report_type?: string
          total_checked?: number
          total_complete?: number
          total_issues?: number
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          drama_id: string
          id: string
          rating: number
          updated_at: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          drama_id: string
          id?: string
          rating: number
          updated_at?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          drama_id?: string
          id?: string
          rating?: number
          updated_at?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_drama_id_fkey"
            columns: ["drama_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          air_date: string | null
          content_id: string
          created_at: string | null
          episode_count: number | null
          id: string
          name: string | null
          overview: string | null
          poster_path: string | null
          season_number: number
          tmdb_id: number
          updated_at: string | null
          vote_average: number | null
          wiki_overview: string | null
        }
        Insert: {
          air_date?: string | null
          content_id: string
          created_at?: string | null
          episode_count?: number | null
          id?: string
          name?: string | null
          overview?: string | null
          poster_path?: string | null
          season_number: number
          tmdb_id: number
          updated_at?: string | null
          vote_average?: number | null
          wiki_overview?: string | null
        }
        Update: {
          air_date?: string | null
          content_id?: string
          created_at?: string | null
          episode_count?: number | null
          id?: string
          name?: string | null
          overview?: string | null
          poster_path?: string | null
          season_number?: number
          tmdb_id?: number
          updated_at?: string | null
          vote_average?: number | null
          wiki_overview?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          anime_count: number | null
          cn_count: number | null
          completed_at: string | null
          created_at: string | null
          daily_quota: number | null
          error_log: Json | null
          id: string
          in_count: number | null
          jp_count: number | null
          kr_count: number | null
          other_count: number | null
          started_at: string | null
          status: string | null
          sync_type: string
          th_count: number | null
          total_discovered: number | null
          total_failed: number | null
          total_imported: number | null
          total_queued: number | null
          total_skipped: number | null
          tr_count: number | null
          western_count: number | null
        }
        Insert: {
          anime_count?: number | null
          cn_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          daily_quota?: number | null
          error_log?: Json | null
          id?: string
          in_count?: number | null
          jp_count?: number | null
          kr_count?: number | null
          other_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
          th_count?: number | null
          total_discovered?: number | null
          total_failed?: number | null
          total_imported?: number | null
          total_queued?: number | null
          total_skipped?: number | null
          tr_count?: number | null
          western_count?: number | null
        }
        Update: {
          anime_count?: number | null
          cn_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          daily_quota?: number | null
          error_log?: Json | null
          id?: string
          in_count?: number | null
          jp_count?: number | null
          kr_count?: number | null
          other_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
          th_count?: number | null
          total_discovered?: number | null
          total_failed?: number | null
          total_imported?: number | null
          total_queued?: number | null
          total_skipped?: number | null
          tr_count?: number | null
          western_count?: number | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          error_details: string[] | null
          id: string
          metadata: Json | null
          started_at: string
          status: string
          summary: Json | null
          sync_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_details?: string[] | null
          id?: string
          metadata?: Json | null
          started_at: string
          status: string
          summary?: Json | null
          sync_type: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_details?: string[] | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          summary?: Json | null
          sync_type?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      sync_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          id: string
          updated_at: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          id: string
          updated_at?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      analytics_api_errors: {
        Row: {
          api_name: string | null
          endpoint: string | null
          error_count: number | null
          error_messages: string[] | null
          last_occurrence: string | null
          status_code: number | null
        }
        Relationships: []
      }
      analytics_api_hourly_usage: {
        Row: {
          api_name: string | null
          avg_response_time: number | null
          hour: string | null
          rate_limited_count: number | null
          requests_per_hour: number | null
        }
        Relationships: []
      }
      analytics_api_performance: {
        Row: {
          api_name: string | null
          avg_response_time_ms: number | null
          failed_requests: number | null
          first_request: string | null
          last_request: string | null
          max_response_time_ms: number | null
          median_response_time_ms: number | null
          min_response_time_ms: number | null
          p95_response_time_ms: number | null
          rate_limit_hits: number | null
          retry_attempts: number | null
          success_rate: number | null
          successful_requests: number | null
          total_requests: number | null
        }
        Relationships: []
      }
      analytics_batch_imports: {
        Row: {
          batch_end: string | null
          batch_start: string | null
          import_batch_id: string | null
          import_batch_name: string | null
          items_imported: number | null
          wikipedia_enriched: number | null
          wikipedia_enriched_pct: number | null
        }
        Relationships: []
      }
      analytics_enrichment_coverage: {
        Row: {
          batch_tracking_percentage: number | null
          has_batch_tracking: number | null
          has_overview: number | null
          has_tagline: number | null
          has_wikidata: number | null
          has_wikipedia: number | null
          overview_percentage: number | null
          tagline_percentage: number | null
          total_content: number | null
          wikidata_percentage: number | null
          wikipedia_percentage: number | null
        }
        Relationships: []
      }
      analytics_quality_scores: {
        Row: {
          count: number | null
          percentage: number | null
          quality_score: number | null
          quality_tier: string | null
        }
        Relationships: []
      }
      analytics_quality_timeline: {
        Row: {
          avg_quality_score: number | null
          import_date: string | null
          items_imported: number | null
          no_source_count: number | null
          tmdb_count: number | null
          wikipedia_count: number | null
        }
        Relationships: []
      }
      analytics_regional_distribution: {
        Row: {
          has_wikipedia: number | null
          last_import: string | null
          region: string | null
          total_content: number | null
          wikipedia_overview_pct: number | null
          wikipedia_overviews: number | null
          wikipedia_pct: number | null
        }
        Relationships: []
      }
      analytics_slow_endpoints: {
        Row: {
          api_name: string | null
          avg_response_time_ms: number | null
          endpoint: string | null
          max_response_time_ms: number | null
          p95_response_time_ms: number | null
          request_count: number | null
        }
        Relationships: []
      }
      analytics_source_distribution: {
        Row: {
          count: number | null
          overview_source: string | null
          percentage: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_priority_score: {
        Args: {
          p_content_type: string
          p_country_code: string
          p_popularity: number
        }
        Returns: number
      }
      claim_queue_item: {
        Args: { max_attempts?: number }
        Returns: {
          attempts: number
          content_type: string
          id: string
          priority: number
          tmdb_id: number
        }[]
      }
      cleanup_api_logs: { Args: { days_to_keep?: number }; Returns: number }
      determine_region: { Args: { origin_country: string[] }; Returns: string }
      get_api_usage_summary: { Args: { hours_back?: number }; Returns: Json }
      get_complete_schema: { Args: never; Returns: Json }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_quality_trend: {
        Args: { days?: number }
        Returns: {
          avg_quality_score: number
          date: string
          items_imported: number
          wikipedia_percentage: number
        }[]
      }
      increment_queue_attempts: {
        Args: { queue_id: string }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { email: string }; Returns: boolean }
      is_content_already_imported: {
        Args: { p_content_type: string; p_tmdb_id: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

