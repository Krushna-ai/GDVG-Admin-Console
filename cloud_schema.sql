


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."calculate_priority_score"("p_country_code" "text", "p_content_type" "text", "p_popularity" numeric) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    country_score INTEGER;
    type_score INTEGER;
    pop_score INTEGER;
BEGIN
    -- Country priority: KR(10) > CN(9) > TH(8) > TR(7) > JP(6) > Anime(5) > IN(4) > Bollywood(3) > Western(2) > Other(1)
    country_score := CASE p_country_code
        WHEN 'KR' THEN 10
        WHEN 'CN' THEN 9
        WHEN 'TW' THEN 9
        WHEN 'HK' THEN 9
        WHEN 'TH' THEN 8
        WHEN 'TR' THEN 7
        WHEN 'JP' THEN 6
        WHEN 'IN' THEN 4
        WHEN 'US' THEN 2
        WHEN 'GB' THEN 2
        WHEN 'CA' THEN 2
        WHEN 'AU' THEN 2
        ELSE 1
    END;
    
    -- Content type priority: drama(10) > tv(8) > movie(6) > anime(5) > other(1)
    type_score := CASE p_content_type
        WHEN 'drama' THEN 10
        WHEN 'tv' THEN 8
        WHEN 'movie' THEN 6
        WHEN 'anime' THEN 5
        ELSE 1
    END;
    
    -- Popularity score (0-10 based on TMDB popularity)
    pop_score := LEAST(FLOOR(COALESCE(p_popularity, 0) / 10), 10);
    
    -- Final score: (country × 2) + type + popularity
    RETURN (country_score * 2) + type_score + pop_score;
END;
$$;


ALTER FUNCTION "public"."calculate_priority_score"("p_country_code" "text", "p_content_type" "text", "p_popularity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_queue_item"("max_attempts" integer DEFAULT 3) RETURNS TABLE("id" "uuid", "tmdb_id" integer, "content_type" "text", "priority" integer, "attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    UPDATE public.import_queue q
    SET status = 'processing',
        updated_at = now()
    WHERE q.id = (
        SELECT q2.id 
        FROM public.import_queue q2
        WHERE q2.status = 'pending' 
          AND q2.attempts < max_attempts
        ORDER BY q2.priority DESC, q2.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING q.id, q.tmdb_id, q.content_type, q.priority, q.attempts;
END;
$$;


ALTER FUNCTION "public"."claim_queue_item"("max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_usage_log
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer) IS 'Deletes API logs older than N days (default 30). Returns number of deleted rows.';



CREATE OR REPLACE FUNCTION "public"."determine_region"("origin_country" "text"[]) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF origin_country IS NULL OR array_length(origin_country, 1) = 0 THEN
    RETURN 'UNKNOWN';
  END IF;
  
  -- Check for specific regions (priority order)
  IF 'KR' = ANY(origin_country) THEN RETURN 'KR';
  END IF;
  IF 'CN' = ANY(origin_country) OR 'HK' = ANY(origin_country) OR 'TW' = ANY(origin_country) THEN RETURN 'CN';
  END IF;
  IF 'JP' = ANY(origin_country) THEN RETURN 'JP';
  END IF;
  IF 'IN' = ANY(origin_country) THEN RETURN 'IN';
  END IF;
  IF 'TH' = ANY(origin_country) THEN RETURN 'TH';
  END IF;
  IF 'TR' = ANY(origin_country) THEN RETURN 'TR';
  END IF;
  
  -- Check for Western countries
  IF 'US' = ANY(origin_country) OR 'GB' = ANY(origin_country) OR 'CA' = ANY(origin_country) 
     OR 'AU' = ANY(origin_country) OR 'FR' = ANY(origin_country) OR 'DE' = ANY(origin_country)
     OR 'IT' = ANY(origin_country) OR 'ES' = ANY(origin_country) THEN 
    RETURN 'WESTERN';
  END IF;
  
  RETURN 'OTHER';
END;
$$;


ALTER FUNCTION "public"."determine_region"("origin_country" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_api_usage_summary"("hours_back" integer DEFAULT 24) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_requests', (
      SELECT COUNT(*) 
      FROM api_usage_log 
      WHERE created_at >= NOW() - (hours_back || ' hours')::INTERVAL
    ),
    'by_api', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'total_requests', total_requests,
          'success_rate', success_rate,
          'avg_response_time_ms', avg_response_time_ms,
          'rate_limit_hits', rate_limit_hits
        )
      )
      FROM analytics_api_performance
    ),
    'recent_errors', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'endpoint', endpoint,
          'status_code', status_code,
          'error_count', error_count,
          'last_occurrence', last_occurrence
        )
      )
      FROM (
        SELECT * FROM analytics_api_errors ORDER BY last_occurrence DESC LIMIT 10
      ) recent
    ),
    'slow_endpoints', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'endpoint', endpoint,
          'p95_response_time_ms', p95_response_time_ms
        )
      )
      FROM (
        SELECT * FROM analytics_slow_endpoints LIMIT 5
      ) slow
    )
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_api_usage_summary"("hours_back" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_api_usage_summary"("hours_back" integer) IS 'Returns comprehensive API usage summary for the last N hours';



CREATE OR REPLACE FUNCTION "public"."get_complete_schema"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result jsonb;
BEGIN
    -- Get all enums
    WITH enum_types AS (
        SELECT 
            t.typname as enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
    )
    SELECT jsonb_build_object(
        'enums',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', enum_name,
                    'values', to_jsonb(enum_values)
                )
            ),
            '[]'::jsonb
        )
    )
    FROM enum_types
    INTO result;

    -- Get all tables with their details
    WITH RECURSIVE 
    columns_info AS (
        SELECT 
            c.oid as table_oid,
            c.relname as table_name,
            a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as column_type,
            a.attnotnull as notnull,
            pg_get_expr(d.adbin, d.adrelid) as column_default,
            CASE 
                WHEN a.attidentity != '' THEN true
                WHEN pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%' THEN true
                ELSE false
            END as is_identity,
            EXISTS (
                SELECT 1 FROM pg_constraint con 
                WHERE con.conrelid = c.oid 
                AND con.contype = 'p' 
                AND a.attnum = ANY(con.conkey)
            ) as is_pk
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' 
        AND c.relkind = 'r'
        AND a.attnum > 0 
        AND NOT a.attisdropped
    ),
    fk_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', con.conname,
                    'column', col.attname,
                    'foreign_schema', fs.nspname,
                    'foreign_table', ft.relname,
                    'foreign_column', fcol.attname,
                    'on_delete', CASE con.confdeltype
                        WHEN 'a' THEN 'NO ACTION'
                        WHEN 'c' THEN 'CASCADE'
                        WHEN 'r' THEN 'RESTRICT'
                        WHEN 'n' THEN 'SET NULL'
                        WHEN 'd' THEN 'SET DEFAULT'
                        ELSE NULL
                    END
                )
            ) as foreign_keys
        FROM pg_class c
        JOIN pg_constraint con ON con.conrelid = c.oid
        JOIN pg_attribute col ON col.attrelid = con.conrelid AND col.attnum = ANY(con.conkey)
        JOIN pg_class ft ON ft.oid = con.confrelid
        JOIN pg_namespace fs ON fs.oid = ft.relnamespace
        JOIN pg_attribute fcol ON fcol.attrelid = con.confrelid AND fcol.attnum = ANY(con.confkey)
        WHERE con.contype = 'f'
        GROUP BY c.oid
    ),
    index_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', i.relname,
                    'using', am.amname,
                    'columns', (
                        SELECT jsonb_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum))
                        FROM unnest(ix.indkey) WITH ORDINALITY as u(attnum, ord)
                        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
                    )
                )
            ) as indexes
        FROM pg_class c
        JOIN pg_index ix ON ix.indrelid = c.oid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON am.oid = i.relam
        WHERE NOT ix.indisprimary
        GROUP BY c.oid
    ),
    policy_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', pol.polname,
                    'command', CASE pol.polcmd
                        WHEN 'r' THEN 'SELECT'
                        WHEN 'a' THEN 'INSERT'
                        WHEN 'w' THEN 'UPDATE'
                        WHEN 'd' THEN 'DELETE'
                        WHEN '*' THEN 'ALL'
                    END,
                    'roles', (
                        SELECT string_agg(quote_ident(r.rolname), ', ')
                        FROM pg_roles r
                        WHERE r.oid = ANY(pol.polroles)
                    ),
                    'using', pg_get_expr(pol.polqual, pol.polrelid),
                    'check', pg_get_expr(pol.polwithcheck, pol.polrelid)
                )
            ) as policies
        FROM pg_class c
        JOIN pg_policy pol ON pol.polrelid = c.oid
        GROUP BY c.oid
    ),
    trigger_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', t.tgname,
                    'timing', CASE 
                        WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                        WHEN t.tgtype & 4 = 4 THEN 'AFTER'
                        WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
                    END,
                    'events', (
                        CASE WHEN t.tgtype & 1 = 1 THEN 'INSERT'
                             WHEN t.tgtype & 8 = 8 THEN 'DELETE'
                             WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
                             WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
                        END
                    ),
                    'statement', pg_get_triggerdef(t.oid)
                )
            ) as triggers
        FROM pg_class c
        JOIN pg_trigger t ON t.tgrelid = c.oid
        WHERE NOT t.tgisinternal
        GROUP BY c.oid
    ),
    table_info AS (
        SELECT DISTINCT 
            c.table_oid,
            c.table_name,
            jsonb_agg(
                jsonb_build_object(
                    'name', c.column_name,
                    'type', c.column_type,
                    'notnull', c.notnull,
                    'default', c.column_default,
                    'identity', c.is_identity,
                    'is_pk', c.is_pk
                ) ORDER BY c.column_name
            ) as columns,
            COALESCE(fk.foreign_keys, '[]'::jsonb) as foreign_keys,
            COALESCE(i.indexes, '[]'::jsonb) as indexes,
            COALESCE(p.policies, '[]'::jsonb) as policies,
            COALESCE(t.triggers, '[]'::jsonb) as triggers
        FROM columns_info c
        LEFT JOIN fk_info fk ON fk.table_oid = c.table_oid
        LEFT JOIN index_info i ON i.table_oid = c.table_oid
        LEFT JOIN policy_info p ON p.table_oid = c.table_oid
        LEFT JOIN trigger_info t ON t.table_oid = c.table_oid
        GROUP BY c.table_oid, c.table_name, fk.foreign_keys, i.indexes, p.policies, t.triggers
    )
    SELECT result || jsonb_build_object(
        'tables',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', table_name,
                    'columns', columns,
                    'foreign_keys', foreign_keys,
                    'indexes', indexes,
                    'policies', policies,
                    'triggers', triggers
                )
            ),
            '[]'::jsonb
        )
    )
    FROM table_info
    INTO result;

    -- Get all functions
    WITH function_info AS (
        SELECT 
            p.proname AS name,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.prokind = 'f'
    )
    SELECT result || jsonb_build_object(
        'functions',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', name,
                    'definition', definition
                )
            ),
            '[]'::jsonb
        )
    )
    FROM function_info
    INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_complete_schema"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_summary"() RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_content', (SELECT COUNT(*) FROM content),
    'enrichment_coverage', (
      SELECT json_build_object(
        'wikipedia_url', wikipedia_percentage,
        'overview', overview_percentage,
        'wikidata_id', wikidata_percentage
      )
      FROM analytics_enrichment_coverage
    ),
    'source_distribution', (
      SELECT json_agg(json_build_object(
        'source', overview_source,
        'count', count,
        'percentage', percentage
      ))
      FROM analytics_source_distribution
    ),
    'quality_distribution', (
      SELECT json_agg(json_build_object(
        'tier', quality_tier,
        'score', quality_score,
        'count', count,
        'percentage', percentage
      ))
      FROM analytics_quality_scores
    ),
    'recent_batches', (
      SELECT json_agg(data)
      FROM (
        SELECT json_build_object(
          'name', import_batch_name,
          'date', batch_start,
          'items', items_imported,
          'wikipedia_enriched_pct', wikipedia_enriched_pct
        ) as data
        FROM analytics_batch_imports
        LIMIT 5
      ) sub
    )
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_summary"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_dashboard_summary"() IS 'Returns comprehensive dashboard summary JSON with all key metrics';



CREATE OR REPLACE FUNCTION "public"."get_incomplete_tv_shows"("limit_num" integer DEFAULT 50, "start_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid") RETURNS TABLE("id" "uuid", "tmdb_id" integer, "title" "text", "number_of_seasons" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.id, c.tmdb_id, c.title, c.number_of_seasons
  FROM content c
  WHERE c.content_type = 'tv' 
    AND c.number_of_seasons > 0
    AND c.id > start_id
    AND c.number_of_seasons > (
      SELECT COUNT(*) FROM seasons s WHERE s.content_id = c.id
    )
  ORDER BY c.id
  LIMIT limit_num;
$$;


ALTER FUNCTION "public"."get_incomplete_tv_shows"("limit_num" integer, "start_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quality_trend"("days" integer DEFAULT 30) RETURNS TABLE("date" "date", "items_imported" bigint, "avg_quality_score" numeric, "wikipedia_percentage" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    import_date as date,
    analytics_quality_timeline.items_imported,
    analytics_quality_timeline.avg_quality_score,
    ROUND(wikipedia_count * 100.0 / NULLIF(analytics_quality_timeline.items_imported, 0), 2) as wikipedia_percentage
  FROM analytics_quality_timeline
  WHERE import_date >= CURRENT_DATE - days
  ORDER BY import_date DESC;
END;
$$;


ALTER FUNCTION "public"."get_quality_trend"("days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_quality_trend"("days" integer) IS 'Returns quality metrics trend for the last N days';



CREATE OR REPLACE FUNCTION "public"."increment_queue_attempts"("queue_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.import_queue
    SET attempts = attempts + 1,
        updated_at = now()
    WHERE id = queue_id;
END;
$$;


ALTER FUNCTION "public"."increment_queue_attempts"("queue_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Updated with your specific email
  return email = 'globaldramaverseguide45@gmail.com';
end;
$$;


ALTER FUNCTION "public"."is_admin"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_content_already_imported"("p_tmdb_id" integer, "p_content_type" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM content 
        WHERE tmdb_id = p_tmdb_id 
        AND content_type = p_content_type
    );
END;
$$;


ALTER FUNCTION "public"."is_content_already_imported"("p_tmdb_id" integer, "p_content_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_enrichment_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_enrichment_queue_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_pdf_job_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_pdf_job_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_pdf_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_pdf_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_validation_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "content_type" "text" NOT NULL,
    "vote_count" integer DEFAULT 0,
    "vote_average" numeric DEFAULT 0,
    "popularity" numeric DEFAULT 0,
    "priority" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "batch_name" "text",
    "source" "text" DEFAULT 'harvester'::"text",
    "error_message" "text",
    "attempts" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "metadata" "jsonb"
);


ALTER TABLE "public"."ai_validation_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_name" character varying(50) NOT NULL,
    "endpoint" "text" NOT NULL,
    "method" character varying(10) DEFAULT 'GET'::character varying,
    "status_code" integer,
    "response_time_ms" integer,
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "rate_limited" boolean DEFAULT false,
    "request_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_usage_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_usage_log" IS 'Logs all external API calls for performance monitoring and rate limit tracking';



COMMENT ON COLUMN "public"."api_usage_log"."api_name" IS 'Name of the API: wikipedia, wikidata, tmdb';



COMMENT ON COLUMN "public"."api_usage_log"."endpoint" IS 'API endpoint URL or path';



COMMENT ON COLUMN "public"."api_usage_log"."status_code" IS 'HTTP status code (200, 404, 429, 500, etc.)';



COMMENT ON COLUMN "public"."api_usage_log"."response_time_ms" IS 'Response time in milliseconds';



COMMENT ON COLUMN "public"."api_usage_log"."rate_limited" IS 'Whether this request encountered rate limiting (429 status)';



COMMENT ON COLUMN "public"."api_usage_log"."request_metadata" IS 'Additional metadata about the request in JSON format';



CREATE OR REPLACE VIEW "public"."analytics_api_errors" WITH ("security_invoker"='true') AS
 SELECT "api_name",
    "endpoint",
    "status_code",
    "count"(*) AS "error_count",
    "array_agg"(DISTINCT "error_message") FILTER (WHERE ("error_message" IS NOT NULL)) AS "error_messages",
    "max"("created_at") AS "last_occurrence"
   FROM "public"."api_usage_log"
  WHERE (("status_code" >= 400) OR ("error_message" IS NOT NULL))
  GROUP BY "api_name", "endpoint", "status_code"
  ORDER BY ("count"(*)) DESC, ("max"("created_at")) DESC;


ALTER VIEW "public"."analytics_api_errors" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_api_errors" IS 'Tracks API errors grouped by API, endpoint, and status code';



CREATE OR REPLACE VIEW "public"."analytics_api_hourly_usage" WITH ("security_invoker"='true') AS
 SELECT "api_name",
    "date_trunc"('hour'::"text", "created_at") AS "hour",
    "count"(*) AS "requests_per_hour",
    "count"(*) FILTER (WHERE ("rate_limited" = true)) AS "rate_limited_count",
    "round"("avg"("response_time_ms"), 2) AS "avg_response_time"
   FROM "public"."api_usage_log"
  WHERE ("created_at" >= ("now"() - '7 days'::interval))
  GROUP BY "api_name", ("date_trunc"('hour'::"text", "created_at"))
  ORDER BY ("date_trunc"('hour'::"text", "created_at")) DESC, "api_name";


ALTER VIEW "public"."analytics_api_hourly_usage" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_api_hourly_usage" IS 'Hourly API usage breakdown for the last 7 days';



CREATE OR REPLACE VIEW "public"."analytics_api_performance" WITH ("security_invoker"='true') AS
 SELECT "api_name",
    "count"(*) AS "total_requests",
    "count"(*) FILTER (WHERE (("status_code" >= 200) AND ("status_code" < 300))) AS "successful_requests",
    "count"(*) FILTER (WHERE ("status_code" >= 400)) AS "failed_requests",
    "round"(((("count"(*) FILTER (WHERE (("status_code" >= 200) AND ("status_code" < 300))))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "success_rate",
    "round"("avg"("response_time_ms"), 2) AS "avg_response_time_ms",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("response_time_ms")::double precision)))::numeric, 2) AS "median_response_time_ms",
    "round"(("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("response_time_ms")::double precision)))::numeric, 2) AS "p95_response_time_ms",
    "min"("response_time_ms") AS "min_response_time_ms",
    "max"("response_time_ms") AS "max_response_time_ms",
    "count"(*) FILTER (WHERE ("rate_limited" = true)) AS "rate_limit_hits",
    "count"(*) FILTER (WHERE ("retry_count" > 0)) AS "retry_attempts",
    "min"("created_at") AS "first_request",
    "max"("created_at") AS "last_request"
   FROM "public"."api_usage_log"
  GROUP BY "api_name"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."analytics_api_performance" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_api_performance" IS 'Aggregated API performance metrics by API name';



CREATE SEQUENCE IF NOT EXISTS "public"."content_gdvg_id_seq"
    START WITH 100000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."content_gdvg_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "imdb_id" "text",
    "content_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "original_title" "text",
    "overview" "text",
    "poster_path" "text",
    "backdrop_path" "text",
    "release_date" "date",
    "first_air_date" "date",
    "status" "text" DEFAULT 'draft'::"text",
    "original_language" "text",
    "origin_country" "text"[],
    "genres" "jsonb",
    "popularity" numeric,
    "vote_average" numeric,
    "vote_count" integer,
    "runtime" integer,
    "number_of_seasons" integer,
    "number_of_episodes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tagline" "text",
    "homepage" "text",
    "budget" bigint,
    "revenue" bigint,
    "production_companies" "jsonb",
    "production_countries" "jsonb",
    "spoken_languages" "jsonb",
    "networks" "jsonb",
    "last_air_date" "date",
    "in_production" boolean DEFAULT false,
    "tmdb_status" "text",
    "content_rating" "text",
    "keywords" "jsonb",
    "alternative_titles" "jsonb",
    "videos" "jsonb",
    "watch_providers" "jsonb",
    "wikidata_id" "text",
    "tvdb_id" integer,
    "wikipedia_url" "text",
    "overview_source" "text" DEFAULT 'tmdb'::"text",
    "import_batch_id" "uuid",
    "import_batch_name" "text",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "region" "text",
    "main_poster" "text",
    "images" "jsonb",
    "enriched_at" timestamp with time zone,
    "enrichment_cycle" integer DEFAULT 0,
    "translations" "jsonb",
    "reviews_tmdb" "jsonb",
    "recommendations" "jsonb",
    "similar_content" "jsonb",
    "external_ids" "jsonb",
    "social_ids" "jsonb",
    "gdvg_id" integer DEFAULT "nextval"('"public"."content_gdvg_id_seq"'::"regclass"),
    "wiki_plot" "text",
    "wiki_synopsis" "text",
    "wiki_episode_guide" "text",
    "wiki_production" "text",
    "wiki_cast_notes" "text",
    "wiki_reception" "text",
    "wiki_soundtrack" "text",
    "wiki_release" "text",
    "wiki_accolades" "text",
    "release_dates" "jsonb",
    "aggregate_credits" "jsonb",
    "original_network" "text",
    "screenwriters" "jsonb",
    "based_on" "text",
    "filming_location" "text",
    "narrative_location" "text",
    "review_score_rt" "text",
    "review_score_mc" "text",
    "box_office" bigint,
    "belongs_to_collection" "jsonb",
    "collection_id" "uuid",
    "wikidata_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "content_content_type_check" CHECK (("content_type" = ANY (ARRAY['movie'::"text", 'tv'::"text", 'drama'::"text", 'anime'::"text", 'variety'::"text", 'documentary'::"text"]))),
    CONSTRAINT "content_overview_source_check" CHECK (("overview_source" = ANY (ARRAY['wikipedia'::"text", 'tmdb'::"text", 'none'::"text"]))),
    CONSTRAINT "content_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."content" OWNER TO "postgres";


COMMENT ON TABLE "public"."content" IS 'Unified content table for movies, TV shows, anime, K-dramas, etc. Enriched from TMDB.';



COMMENT ON COLUMN "public"."content"."poster_path" IS 'Legacy TMDB poster path (kept for compatibility)';



COMMENT ON COLUMN "public"."content"."backdrop_path" IS 'Legacy TMDB backdrop path (kept for compatibility)';



COMMENT ON COLUMN "public"."content"."content_rating" IS 'Age rating like TV-MA, 15+, PG-13';



COMMENT ON COLUMN "public"."content"."keywords" IS 'TMDB keywords/tags array [{id, name}]';



COMMENT ON COLUMN "public"."content"."alternative_titles" IS 'Alternative titles array [{iso_3166_1, title, type}]';



COMMENT ON COLUMN "public"."content"."videos" IS 'TMDB videos (trailers, teasers, interviews, featurettes) organized by type';



COMMENT ON COLUMN "public"."content"."watch_providers" IS 'Streaming providers by region {IN: {flatrate: [], rent: []}}';



COMMENT ON COLUMN "public"."content"."wikidata_id" IS 'Wikidata Q-number identifier';



COMMENT ON COLUMN "public"."content"."tvdb_id" IS 'TheTVDB identifier';



COMMENT ON COLUMN "public"."content"."wikipedia_url" IS 'Wikipedia page URL if overview was sourced from Wikipedia';



COMMENT ON COLUMN "public"."content"."overview_source" IS 'Source of overview data: wikipedia, tmdb, or none';



COMMENT ON COLUMN "public"."content"."import_batch_id" IS 'UUID of the import batch/job';



COMMENT ON COLUMN "public"."content"."import_batch_name" IS 'Human-readable batch name (e.g., "auto-import-2026-02-07", "bulk-korean-dramas")';



COMMENT ON COLUMN "public"."content"."imported_at" IS 'Timestamp when item was first imported';



COMMENT ON COLUMN "public"."content"."region" IS 'Content region categorization: KR (Korean), CN (Chinese), JP (Japanese), IN (Indian), TH (Thai), TR (Turkish), WESTERN, OTHER';



COMMENT ON COLUMN "public"."content"."main_poster" IS 'Primary poster image displayed in main app UI';



COMMENT ON COLUMN "public"."content"."images" IS 'TMDB image collections: {posters: [], backdrops: [], logos: []}';



COMMENT ON COLUMN "public"."content"."enriched_at" IS 'Timestamp when this content was last enriched with TMDB data';



COMMENT ON COLUMN "public"."content"."enrichment_cycle" IS 'Tracks which enrichment cycle this content was last enriched in (0-8, auto-resets)';



COMMENT ON COLUMN "public"."content"."translations" IS 'JSONB: All translations from TMDB (titles, overviews in different languages)';



COMMENT ON COLUMN "public"."content"."reviews_tmdb" IS 'JSONB: User reviews from TMDB with author, rating, content';



COMMENT ON COLUMN "public"."content"."recommendations" IS 'JSONB: TMDB recommended content (tmdb_id, title, media_type)';



COMMENT ON COLUMN "public"."content"."similar_content" IS 'JSONB: TMDB similar content (tmdb_id, title)';



COMMENT ON COLUMN "public"."content"."external_ids" IS 'JSONB: Consolidated external IDs (IMDb, Wikidata, Facebook, Instagram, Twitter, TVDB)';



COMMENT ON COLUMN "public"."content"."social_ids" IS 'JSONB: Social media platform IDs and handles';



COMMENT ON COLUMN "public"."content"."wiki_plot" IS 'Wikipedia: Full plot summary';



COMMENT ON COLUMN "public"."content"."wiki_synopsis" IS 'Wikipedia: Detailed synopsis (episode-by-episode for TV)';



COMMENT ON COLUMN "public"."content"."wiki_episode_guide" IS 'Wikipedia: Episode list / season overview';



COMMENT ON COLUMN "public"."content"."wiki_production" IS 'Wikipedia: Development, filming, writing, VFX notes';



COMMENT ON COLUMN "public"."content"."wiki_cast_notes" IS 'Wikipedia: Cast details and character descriptions';



COMMENT ON COLUMN "public"."content"."wiki_reception" IS 'Wikipedia: Critical reception, box office, audience ratings';



COMMENT ON COLUMN "public"."content"."wiki_soundtrack" IS 'Wikipedia: Music and score details';



COMMENT ON COLUMN "public"."content"."wiki_release" IS 'Wikipedia: Broadcast, streaming, premiere information';



COMMENT ON COLUMN "public"."content"."wiki_accolades" IS 'Wikipedia: Awards and nominations';



CREATE OR REPLACE VIEW "public"."analytics_batch_imports" WITH ("security_invoker"='true') AS
 SELECT "import_batch_name",
    "import_batch_id",
    "min"("imported_at") AS "batch_start",
    "max"("imported_at") AS "batch_end",
    "count"(*) AS "items_imported",
    "count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)) AS "wikipedia_enriched",
    "round"(((("count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "wikipedia_enriched_pct"
   FROM "public"."content"
  WHERE ("import_batch_id" IS NOT NULL)
  GROUP BY "import_batch_name", "import_batch_id"
  ORDER BY ("min"("imported_at")) DESC;


ALTER VIEW "public"."analytics_batch_imports" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_batch_imports" IS 'Tracks batch import statistics and enrichment effectiveness per batch';



CREATE OR REPLACE VIEW "public"."analytics_enrichment_coverage" WITH ("security_invoker"='true') AS
 SELECT "count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)) AS "has_wikipedia",
    "round"(((("count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "wikipedia_percentage",
    "count"(*) FILTER (WHERE ("overview" IS NOT NULL)) AS "has_overview",
    "round"(((("count"(*) FILTER (WHERE ("overview" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "overview_percentage",
    "count"(*) FILTER (WHERE ("tagline" IS NOT NULL)) AS "has_tagline",
    "round"(((("count"(*) FILTER (WHERE ("tagline" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "tagline_percentage",
    "count"(*) FILTER (WHERE ("wikidata_id" IS NOT NULL)) AS "has_wikidata",
    "round"(((("count"(*) FILTER (WHERE ("wikidata_id" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "wikidata_percentage",
    "count"(*) FILTER (WHERE ("import_batch_id" IS NOT NULL)) AS "has_batch_tracking",
    "round"(((("count"(*) FILTER (WHERE ("import_batch_id" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "batch_tracking_percentage",
    "count"(*) AS "total_content"
   FROM "public"."content";


ALTER VIEW "public"."analytics_enrichment_coverage" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_enrichment_coverage" IS 'Tracks percentage of content with various enrichment fields populated';



CREATE OR REPLACE VIEW "public"."analytics_quality_scores" WITH ("security_invoker"='true') AS
 SELECT
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 'Excellent (Wikipedia)'::"text"
            WHEN ("overview_source" = 'tmdb'::"text") THEN 'Good (TMDB)'::"text"
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 'Fair (Unknown Source)'::"text"
            ELSE 'Poor (No Overview)'::"text"
        END AS "quality_tier",
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 100
            WHEN ("overview_source" = 'tmdb'::"text") THEN 75
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 50
            ELSE 0
        END AS "quality_score",
    "count"(*) AS "count",
    "round"(((("count"(*))::numeric * 100.0) / (NULLIF(( SELECT "count"(*) AS "count"
           FROM "public"."content" "content_1"), 0))::numeric), 2) AS "percentage"
   FROM "public"."content"
  GROUP BY
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 'Excellent (Wikipedia)'::"text"
            WHEN ("overview_source" = 'tmdb'::"text") THEN 'Good (TMDB)'::"text"
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 'Fair (Unknown Source)'::"text"
            ELSE 'Poor (No Overview)'::"text"
        END,
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 100
            WHEN ("overview_source" = 'tmdb'::"text") THEN 75
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 50
            ELSE 0
        END
  ORDER BY
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 100
            WHEN ("overview_source" = 'tmdb'::"text") THEN 75
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 50
            ELSE 0
        END DESC;


ALTER VIEW "public"."analytics_quality_scores" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_quality_scores" IS 'Groups content by quality tiers based on data source quality';



CREATE OR REPLACE VIEW "public"."analytics_quality_timeline" WITH ("security_invoker"='true') AS
 SELECT "date"("imported_at") AS "import_date",
    "count"(*) AS "items_imported",
    "count"(*) FILTER (WHERE ("overview_source" = 'wikipedia'::"text")) AS "wikipedia_count",
    "count"(*) FILTER (WHERE ("overview_source" = 'tmdb'::"text")) AS "tmdb_count",
    "count"(*) FILTER (WHERE ("overview_source" IS NULL)) AS "no_source_count",
    "round"("avg"(
        CASE
            WHEN ("overview_source" = 'wikipedia'::"text") THEN 100
            WHEN ("overview_source" = 'tmdb'::"text") THEN 75
            WHEN (("overview_source" IS NULL) AND ("overview" IS NOT NULL)) THEN 50
            ELSE 0
        END), 2) AS "avg_quality_score"
   FROM "public"."content"
  WHERE ("imported_at" IS NOT NULL)
  GROUP BY ("date"("imported_at"))
  ORDER BY ("date"("imported_at")) DESC;


ALTER VIEW "public"."analytics_quality_timeline" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_quality_timeline" IS 'Shows data quality trends over time by import date';



CREATE OR REPLACE VIEW "public"."analytics_regional_distribution" WITH ("security_invoker"='true') AS
 SELECT "region",
    "count"(*) AS "total_content",
    "count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)) AS "has_wikipedia",
    "round"(((("count"(*) FILTER (WHERE ("wikipedia_url" IS NOT NULL)))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "wikipedia_pct",
    "count"(*) FILTER (WHERE ("overview_source" = 'wikipedia'::"text")) AS "wikipedia_overviews",
    "round"(((("count"(*) FILTER (WHERE ("overview_source" = 'wikipedia'::"text")))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 2) AS "wikipedia_overview_pct",
    "max"("imported_at") AS "last_import"
   FROM "public"."content"
  WHERE ("region" IS NOT NULL)
  GROUP BY "region"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."analytics_regional_distribution" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_regional_distribution" IS 'Shows content distribution by region with enrichment stats';



CREATE OR REPLACE VIEW "public"."analytics_slow_endpoints" WITH ("security_invoker"='true') AS
 SELECT "api_name",
    "endpoint",
    "count"(*) AS "request_count",
    "round"("avg"("response_time_ms"), 2) AS "avg_response_time_ms",
    "round"(("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("response_time_ms")::double precision)))::numeric, 2) AS "p95_response_time_ms",
    "max"("response_time_ms") AS "max_response_time_ms"
   FROM "public"."api_usage_log"
  WHERE ("response_time_ms" IS NOT NULL)
  GROUP BY "api_name", "endpoint"
 HAVING ("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("response_time_ms")::double precision)) > (2000)::double precision)
  ORDER BY ("round"(("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("response_time_ms")::double precision)))::numeric, 2)) DESC;


ALTER VIEW "public"."analytics_slow_endpoints" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_slow_endpoints" IS 'Identifies slow API endpoints with 95th percentile > 2 seconds';



CREATE OR REPLACE VIEW "public"."analytics_source_distribution" WITH ("security_invoker"='true') AS
 SELECT "overview_source",
    "count"(*) AS "count",
    "round"(((("count"(*))::numeric * 100.0) / (NULLIF(( SELECT "count"(*) AS "count"
           FROM "public"."content" "content_1"), 0))::numeric), 2) AS "percentage"
   FROM "public"."content"
  WHERE ("overview_source" IS NOT NULL)
  GROUP BY "overview_source"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."analytics_source_distribution" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_source_distribution" IS 'Shows distribution of overview sources (Wikipedia, TMDB, etc.) with counts and percentages';



CREATE TABLE IF NOT EXISTS "public"."awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid",
    "person_id" "uuid",
    "award_name" "text" NOT NULL,
    "category" "text",
    "year" integer,
    "won" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'wikidata'::"text",
    "wikidata_award_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "awards_awardee_check" CHECK (((("content_id" IS NOT NULL) AND ("person_id" IS NULL)) OR (("content_id" IS NULL) AND ("person_id" IS NOT NULL))))
);


ALTER TABLE "public"."awards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "overview" "text",
    "poster_path" "text",
    "backdrop_path" "text",
    "parts" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_cast" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "character_name" "text",
    "order_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role_type" "text" DEFAULT 'support'::"text",
    CONSTRAINT "content_cast_role_type_check" CHECK (("role_type" = ANY (ARRAY['main'::"text", 'support'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."content_cast" OWNER TO "postgres";


COMMENT ON COLUMN "public"."content_cast"."role_type" IS 'Role classification: main, support, or guest';



CREATE TABLE IF NOT EXISTS "public"."content_crew" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "job" "text" NOT NULL,
    "department" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."content_crew" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_watch_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "platform_name" "text" NOT NULL,
    "region" "text" DEFAULT 'ALL'::"text",
    "link_url" "text" NOT NULL,
    "is_affiliate" boolean DEFAULT false,
    "priority" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."content_watch_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drama_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."discussions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrichment_cycles" (
    "id" integer NOT NULL,
    "entity_type" "text" NOT NULL,
    "current_cycle" integer DEFAULT 0,
    "total_items" integer DEFAULT 0,
    "items_completed" integer DEFAULT 0,
    "cycle_started_at" timestamp with time zone,
    "cycle_completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enrichment_cycles" OWNER TO "postgres";


COMMENT ON TABLE "public"."enrichment_cycles" IS 'Tracks global enrichment cycle progress to ensure fair round-robin enrichment';



CREATE SEQUENCE IF NOT EXISTS "public"."enrichment_cycles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."enrichment_cycles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."enrichment_cycles_id_seq" OWNED BY "public"."enrichment_cycles"."id";



CREATE TABLE IF NOT EXISTS "public"."enrichment_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid",
    "queue_type" character varying(50) NOT NULL,
    "priority" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enrichment_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."enrichment_queue" IS 'Queue for content and people enrichment tasks with resume capability';



COMMENT ON COLUMN "public"."enrichment_queue"."entity_id" IS 'UUID of the entity (content or person) to enrich';



COMMENT ON COLUMN "public"."enrichment_queue"."queue_type" IS 'Type of enrichment: content, people, or quality';



COMMENT ON COLUMN "public"."enrichment_queue"."priority" IS 'Higher priority items processed first (default: 0)';



COMMENT ON COLUMN "public"."enrichment_queue"."status" IS 'Current status: pending, processing, completed, failed';



COMMENT ON COLUMN "public"."enrichment_queue"."retry_count" IS 'Number of retry attempts made';



COMMENT ON COLUMN "public"."enrichment_queue"."max_retries" IS 'Maximum number of retry attempts allowed';



COMMENT ON COLUMN "public"."enrichment_queue"."metadata" IS 'Additional metadata in JSON format';



CREATE TABLE IF NOT EXISTS "public"."episodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "season_number" integer NOT NULL,
    "episode_number" integer NOT NULL,
    "episode_type" "text",
    "name" "text",
    "overview" "text",
    "air_date" "date",
    "runtime" integer,
    "still_path" "text",
    "vote_average" numeric,
    "vote_count" integer,
    "production_code" "text",
    "guest_stars" "jsonb",
    "crew" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."episodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "drama_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'Plan to Watch'::"text" NOT NULL,
    "progress" integer DEFAULT 0,
    "score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."favorites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."favorites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."favorites_id_seq" OWNED BY "public"."favorites"."id";



CREATE TABLE IF NOT EXISTS "public"."import_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "configuration" "jsonb" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "progress" "jsonb" DEFAULT '{"total": 0, "failed": 0, "current": 0, "skipped": 0, "success": 0}'::"jsonb",
    "priority" integer DEFAULT 0,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "error_log" "text"[],
    CONSTRAINT "import_jobs_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'paused'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."import_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "configuration" "jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "use_count" integer DEFAULT 0
);


ALTER TABLE "public"."import_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "content_type" "text" NOT NULL,
    "priority" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "batch_name" "text",
    "release_year" integer,
    "release_month" integer,
    "error_message" "text",
    "attempts" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "metadata" "jsonb",
    "source" "text" DEFAULT 'manual'::"text",
    "vote_count" integer DEFAULT 0,
    CONSTRAINT "import_queue_content_type_check" CHECK (("content_type" = ANY (ARRAY['movie'::"text", 'tv'::"text"]))),
    CONSTRAINT "import_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."import_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."import_queue" IS 'Queue for batch TMDB imports. Tracks status, attempts, and errors.';



CREATE SEQUENCE IF NOT EXISTS "public"."people_gdvg_id_seq"
    START WITH 100000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."people_gdvg_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "gender" integer,
    "biography" "text",
    "birthday" "date",
    "deathday" "date",
    "place_of_birth" "text",
    "profile_path" "text",
    "known_for_department" "text",
    "popularity" numeric,
    "imdb_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "also_known_as" "text"[],
    "homepage" "text",
    "adult" boolean DEFAULT false,
    "wikipedia_url" "text",
    "bio_source" "text",
    "import_batch_id" "uuid",
    "import_batch_name" "text",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "main_profile_photo" "text",
    "images" "jsonb",
    "enriched_at" timestamp with time zone,
    "enrichment_cycle" integer DEFAULT 0,
    "external_ids" "jsonb",
    "social_ids" "jsonb",
    "combined_credits_count" integer DEFAULT 0,
    "gdvg_id" integer DEFAULT "nextval"('"public"."people_gdvg_id_seq"'::"regclass"),
    "native_name" "text",
    "instagram" "text",
    "twitter" "text",
    "tiktok" "text",
    "height_cm" integer,
    "wikidata_id" "text",
    CONSTRAINT "people_bio_source_check" CHECK (("bio_source" = ANY (ARRAY['wikipedia'::"text", 'tmdb'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


COMMENT ON TABLE "public"."people" IS 'Cast and crew profiles enriched from TMDB. Linked to content via content_cast and content_crew.';



COMMENT ON COLUMN "public"."people"."profile_path" IS 'Legacy TMDB profile path (kept for compatibility)';



COMMENT ON COLUMN "public"."people"."wikipedia_url" IS 'Wikipedia page URL if biography was sourced from Wikipedia';



COMMENT ON COLUMN "public"."people"."bio_source" IS 'Source of biography data: wikipedia, tmdb, or none';



COMMENT ON COLUMN "public"."people"."import_batch_id" IS 'UUID of the import batch/job';



COMMENT ON COLUMN "public"."people"."import_batch_name" IS 'Human-readable batch name (e.g., "auto-import-2026-02-07")';



COMMENT ON COLUMN "public"."people"."imported_at" IS 'Timestamp when person was first imported';



COMMENT ON COLUMN "public"."people"."main_profile_photo" IS 'Primary profile photo displayed in main app UI';



COMMENT ON COLUMN "public"."people"."images" IS 'TMDB image collections: {profiles: [], tagged: []}';



COMMENT ON COLUMN "public"."people"."enriched_at" IS 'Timestamp when this person was last enriched with TMDB data';



COMMENT ON COLUMN "public"."people"."enrichment_cycle" IS 'Tracks which enrichment cycle this person was last enriched in (0-8, auto-resets)';



COMMENT ON COLUMN "public"."people"."external_ids" IS 'JSONB: Consolidated external IDs (IMDb, Wikidata, Facebook, Instagram, Twitter, TikTok, YouTube)';



COMMENT ON COLUMN "public"."people"."social_ids" IS 'JSONB: Social media platform IDs and handles';



COMMENT ON COLUMN "public"."people"."combined_credits_count" IS 'Total count of cast + crew credits from combined_credits (for quick filtering)';



CREATE TABLE IF NOT EXISTS "public"."quality_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_type" "text" NOT NULL,
    "total_checked" integer NOT NULL,
    "total_complete" integer NOT NULL,
    "total_issues" integer NOT NULL,
    "issues_by_field" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "priority_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quality_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['content'::"text", 'people'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."quality_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."quality_reports" IS 'Stores data quality validation reports generated by GitHub Actions scripts';



COMMENT ON COLUMN "public"."quality_reports"."report_type" IS 'Type of report: content, people, or full';



COMMENT ON COLUMN "public"."quality_reports"."issues_by_field" IS 'JSON object with field names as keys and issue counts as values';



COMMENT ON COLUMN "public"."quality_reports"."priority_items" IS 'JSON array of top items needing enrichment';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drama_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 10)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "season_number" integer NOT NULL,
    "name" "text",
    "overview" "text",
    "air_date" "date",
    "episode_count" integer,
    "poster_path" "text",
    "vote_average" numeric,
    "wiki_overview" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "sync_type" "text" NOT NULL,
    "daily_quota" integer DEFAULT 1000,
    "total_discovered" integer DEFAULT 0,
    "total_queued" integer DEFAULT 0,
    "total_imported" integer DEFAULT 0,
    "total_skipped" integer DEFAULT 0,
    "total_failed" integer DEFAULT 0,
    "kr_count" integer DEFAULT 0,
    "cn_count" integer DEFAULT 0,
    "th_count" integer DEFAULT 0,
    "tr_count" integer DEFAULT 0,
    "jp_count" integer DEFAULT 0,
    "anime_count" integer DEFAULT 0,
    "in_count" integer DEFAULT 0,
    "western_count" integer DEFAULT 0,
    "other_count" integer DEFAULT 0,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "error_log" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "sync_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "sync_jobs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['auto'::"text", 'manual'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."sync_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_type" character varying(30) NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "status" character varying(20) NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb",
    "error_details" "text"[],
    "triggered_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "sync_logs_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::"text"[]))),
    CONSTRAINT "sync_logs_sync_type_check" CHECK ((("sync_type")::"text" = ANY ((ARRAY['cron'::character varying, 'manual'::character varying, 'bulk_import'::character varying, 'gap_fill'::character varying])::"text"[])))
);


ALTER TABLE "public"."sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" character varying(100) NOT NULL,
    "setting_value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."sync_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."enrichment_cycles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."enrichment_cycles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_validation_queue"
    ADD CONSTRAINT "ai_validation_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_validation_queue"
    ADD CONSTRAINT "ai_validation_queue_tmdb_id_content_type_key" UNIQUE ("tmdb_id", "content_type");



ALTER TABLE ONLY "public"."api_usage_log"
    ADD CONSTRAINT "api_usage_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_tmdb_id_key" UNIQUE ("tmdb_id");



ALTER TABLE ONLY "public"."content_cast"
    ADD CONSTRAINT "content_cast_content_id_person_id_character_name_key" UNIQUE ("content_id", "person_id", "character_name");



ALTER TABLE ONLY "public"."content_cast"
    ADD CONSTRAINT "content_cast_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_crew"
    ADD CONSTRAINT "content_crew_content_id_person_id_job_key" UNIQUE ("content_id", "person_id", "job");



ALTER TABLE ONLY "public"."content_crew"
    ADD CONSTRAINT "content_crew_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content"
    ADD CONSTRAINT "content_gdvg_id_unique" UNIQUE ("gdvg_id");



ALTER TABLE ONLY "public"."content"
    ADD CONSTRAINT "content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content"
    ADD CONSTRAINT "content_tmdb_id_content_type_unique" UNIQUE ("tmdb_id", "content_type");



ALTER TABLE ONLY "public"."content_watch_links"
    ADD CONSTRAINT "content_watch_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussions"
    ADD CONSTRAINT "discussions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_cycles"
    ADD CONSTRAINT "enrichment_cycles_entity_type_key" UNIQUE ("entity_type");



ALTER TABLE ONLY "public"."enrichment_cycles"
    ADD CONSTRAINT "enrichment_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_queue"
    ADD CONSTRAINT "enrichment_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_content_id_season_number_episode_number_key" UNIQUE ("content_id", "season_number", "episode_number");



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_tmdb_id_key" UNIQUE ("tmdb_id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_drama_id_key" UNIQUE ("user_id", "drama_id");



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_presets"
    ADD CONSTRAINT "import_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_queue"
    ADD CONSTRAINT "import_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_queue"
    ADD CONSTRAINT "import_queue_tmdb_id_content_type_key" UNIQUE ("tmdb_id", "content_type");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_gdvg_id_unique" UNIQUE ("gdvg_id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_tmdb_id_key" UNIQUE ("tmdb_id");



ALTER TABLE ONLY "public"."quality_reports"
    ADD CONSTRAINT "quality_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_content_id_season_number_key" UNIQUE ("content_id", "season_number");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_jobs"
    ADD CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_logs"
    ADD CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_settings"
    ADD CONSTRAINT "sync_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_settings"
    ADD CONSTRAINT "sync_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_aiq_created_at" ON "public"."ai_validation_queue" USING "btree" ("created_at");



CREATE INDEX "idx_aiq_status_priority" ON "public"."ai_validation_queue" USING "btree" ("status", "priority" DESC);



CREATE INDEX "idx_aiq_vote_count" ON "public"."ai_validation_queue" USING "btree" ("vote_count");



CREATE INDEX "idx_api_usage_api_name" ON "public"."api_usage_log" USING "btree" ("api_name");



CREATE INDEX "idx_api_usage_created_at" ON "public"."api_usage_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_api_usage_rate_limited" ON "public"."api_usage_log" USING "btree" ("rate_limited") WHERE ("rate_limited" = true);



CREATE INDEX "idx_api_usage_status_code" ON "public"."api_usage_log" USING "btree" ("status_code");



CREATE INDEX "idx_awards_content_id" ON "public"."awards" USING "btree" ("content_id");



CREATE INDEX "idx_awards_person_id" ON "public"."awards" USING "btree" ("person_id");



CREATE UNIQUE INDEX "idx_awards_unique" ON "public"."awards" USING "btree" (COALESCE("content_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("person_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "award_name", COALESCE("category", ''::"text"), COALESCE("year", 0));



CREATE INDEX "idx_awards_year" ON "public"."awards" USING "btree" ("year");



CREATE INDEX "idx_cast_content" ON "public"."content_cast" USING "btree" ("content_id");



CREATE INDEX "idx_cast_person" ON "public"."content_cast" USING "btree" ("person_id");



CREATE INDEX "idx_content_collection_id" ON "public"."content" USING "btree" ("collection_id");



CREATE INDEX "idx_content_enrichment_cycle" ON "public"."content" USING "btree" ("enrichment_cycle", "enriched_at");



CREATE INDEX "idx_content_first_air_date" ON "public"."content" USING "btree" ("first_air_date");



CREATE INDEX "idx_content_gdvg_id" ON "public"."content" USING "btree" ("gdvg_id");



CREATE INDEX "idx_content_images_gin" ON "public"."content" USING "gin" ("images");



CREATE INDEX "idx_content_import_batch" ON "public"."content" USING "btree" ("import_batch_id");



CREATE INDEX "idx_content_imported_at" ON "public"."content" USING "btree" ("imported_at");



CREATE INDEX "idx_content_keywords_gin" ON "public"."content" USING "gin" ("keywords");



CREATE INDEX "idx_content_language" ON "public"."content" USING "btree" ("original_language");



CREATE INDEX "idx_content_main_poster" ON "public"."content" USING "btree" ("main_poster") WHERE ("main_poster" IS NOT NULL);



CREATE INDEX "idx_content_popularity" ON "public"."content" USING "btree" ("popularity" DESC NULLS LAST);



CREATE INDEX "idx_content_recommendations_gin" ON "public"."content" USING "gin" ("recommendations");



CREATE INDEX "idx_content_release_date" ON "public"."content" USING "btree" ("release_date");



CREATE INDEX "idx_content_reviews_tmdb_gin" ON "public"."content" USING "gin" ("reviews_tmdb");



CREATE INDEX "idx_content_similar_content_gin" ON "public"."content" USING "gin" ("similar_content");



CREATE INDEX "idx_content_status" ON "public"."content" USING "btree" ("status");



CREATE INDEX "idx_content_status_created_at" ON "public"."content" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_content_status_popularity" ON "public"."content" USING "btree" ("status", "popularity" DESC);



CREATE INDEX "idx_content_status_vote_average" ON "public"."content" USING "btree" ("status", "vote_average" DESC);



CREATE INDEX "idx_content_title_search" ON "public"."content" USING "gin" ("to_tsvector"('"english"'::"regconfig", "title"));



CREATE INDEX "idx_content_tmdb_id" ON "public"."content" USING "btree" ("tmdb_id");



CREATE INDEX "idx_content_translations_gin" ON "public"."content" USING "gin" ("translations");



CREATE INDEX "idx_content_type" ON "public"."content" USING "btree" ("content_type");



CREATE INDEX "idx_content_type_status" ON "public"."content" USING "btree" ("content_type", "status");



CREATE INDEX "idx_content_videos_gin" ON "public"."content" USING "gin" ("videos");



CREATE INDEX "idx_content_vote_average" ON "public"."content" USING "btree" ("vote_average" DESC NULLS LAST);



CREATE INDEX "idx_content_watch_links_content_id" ON "public"."content_watch_links" USING "btree" ("content_id");



CREATE INDEX "idx_content_watch_providers_gin" ON "public"."content" USING "gin" ("watch_providers");



CREATE INDEX "idx_crew_content" ON "public"."content_crew" USING "btree" ("content_id");



CREATE INDEX "idx_crew_job" ON "public"."content_crew" USING "btree" ("job");



CREATE INDEX "idx_crew_person" ON "public"."content_crew" USING "btree" ("person_id");



CREATE INDEX "idx_discussions_drama_id" ON "public"."discussions" USING "btree" ("drama_id");



CREATE INDEX "idx_enrichment_queue_created_at" ON "public"."enrichment_queue" USING "btree" ("created_at");



CREATE INDEX "idx_enrichment_queue_entity_id" ON "public"."enrichment_queue" USING "btree" ("entity_id");



CREATE INDEX "idx_enrichment_queue_priority" ON "public"."enrichment_queue" USING "btree" ("priority" DESC, "created_at");



CREATE INDEX "idx_enrichment_queue_processing" ON "public"."enrichment_queue" USING "btree" ("status", "priority" DESC, "created_at");



CREATE INDEX "idx_enrichment_queue_status" ON "public"."enrichment_queue" USING "btree" ("status");



CREATE INDEX "idx_enrichment_queue_type" ON "public"."enrichment_queue" USING "btree" ("queue_type");



CREATE INDEX "idx_episodes_air_date" ON "public"."episodes" USING "btree" ("air_date");



CREATE INDEX "idx_episodes_content_id" ON "public"."episodes" USING "btree" ("content_id");



CREATE INDEX "idx_episodes_season_id" ON "public"."episodes" USING "btree" ("season_id");



CREATE INDEX "idx_favorites_drama_id" ON "public"."favorites" USING "btree" ("drama_id");



CREATE INDEX "idx_import_jobs_created_at" ON "public"."import_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_import_jobs_created_by" ON "public"."import_jobs" USING "btree" ("created_by");



CREATE INDEX "idx_import_jobs_status" ON "public"."import_jobs" USING "btree" ("status");



CREATE INDEX "idx_import_jobs_status_priority" ON "public"."import_jobs" USING "btree" ("status", "priority" DESC);



CREATE INDEX "idx_import_presets_created_by" ON "public"."import_presets" USING "btree" ("created_by");



CREATE INDEX "idx_import_presets_last_used" ON "public"."import_presets" USING "btree" ("last_used_at" DESC NULLS LAST);



CREATE INDEX "idx_import_presets_use_count" ON "public"."import_presets" USING "btree" ("use_count" DESC);



CREATE INDEX "idx_import_queue_batch" ON "public"."import_queue" USING "btree" ("batch_name");



CREATE INDEX "idx_import_queue_priority_created" ON "public"."import_queue" USING "btree" ("priority" DESC, "created_at");



CREATE INDEX "idx_people_department" ON "public"."people" USING "btree" ("known_for_department");



CREATE INDEX "idx_people_enrichment_cycle" ON "public"."people" USING "btree" ("enrichment_cycle", "enriched_at");



CREATE INDEX "idx_people_gdvg_id" ON "public"."people" USING "btree" ("gdvg_id");



CREATE INDEX "idx_people_images_gin" ON "public"."people" USING "gin" ("images");



CREATE INDEX "idx_people_import_batch" ON "public"."people" USING "btree" ("import_batch_id");



CREATE INDEX "idx_people_imported_at" ON "public"."people" USING "btree" ("imported_at");



CREATE INDEX "idx_people_main_profile_photo" ON "public"."people" USING "btree" ("main_profile_photo") WHERE ("main_profile_photo" IS NOT NULL);



CREATE INDEX "idx_people_name_search" ON "public"."people" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));



CREATE INDEX "idx_people_popularity" ON "public"."people" USING "btree" ("popularity" DESC NULLS LAST);



CREATE INDEX "idx_people_tmdb_id" ON "public"."people" USING "btree" ("tmdb_id");



CREATE INDEX "idx_quality_reports_type_date" ON "public"."quality_reports" USING "btree" ("report_type", "created_at" DESC);



CREATE INDEX "idx_queue_release" ON "public"."import_queue" USING "btree" ("release_year", "release_month");



CREATE INDEX "idx_reviews_drama_id" ON "public"."reviews" USING "btree" ("drama_id");



CREATE INDEX "idx_seasons_content_id" ON "public"."seasons" USING "btree" ("content_id");



CREATE INDEX "idx_sync_jobs_created" ON "public"."sync_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_sync_logs_date" ON "public"."sync_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_sync_logs_status" ON "public"."sync_logs" USING "btree" ("status");



CREATE INDEX "idx_sync_logs_triggered_by" ON "public"."sync_logs" USING "btree" ("triggered_by");



CREATE INDEX "idx_sync_logs_type" ON "public"."sync_logs" USING "btree" ("sync_type");



CREATE INDEX "idx_sync_settings_key" ON "public"."sync_settings" USING "btree" ("setting_key");



CREATE INDEX "idx_sync_settings_updated_by" ON "public"."sync_settings" USING "btree" ("updated_by");



CREATE OR REPLACE TRIGGER "trigger_enrichment_queue_updated_at" BEFORE UPDATE ON "public"."enrichment_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_enrichment_queue_updated_at"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."awards"
    ADD CONSTRAINT "awards_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_cast"
    ADD CONSTRAINT "content_cast_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_cast"
    ADD CONSTRAINT "content_cast_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content"
    ADD CONSTRAINT "content_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id");



ALTER TABLE ONLY "public"."content_crew"
    ADD CONSTRAINT "content_crew_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_crew"
    ADD CONSTRAINT "content_crew_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_watch_links"
    ADD CONSTRAINT "content_watch_links_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discussions"
    ADD CONSTRAINT "discussions_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."episodes"
    ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."import_presets"
    ADD CONSTRAINT "import_presets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sync_logs"
    ADD CONSTRAINT "sync_logs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sync_settings"
    ADD CONSTRAINT "sync_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can do everything with content" ON "public"."content" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage people" ON "public"."people" USING (true) WITH CHECK (true);



CREATE POLICY "Admins can view admin_users" ON "public"."admin_users" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Allow authenticated delete from watch links" ON "public"."content_watch_links" FOR DELETE USING (true);



CREATE POLICY "Allow authenticated insert to watch links" ON "public"."content_watch_links" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated update to watch links" ON "public"."content_watch_links" FOR UPDATE USING (true);



CREATE POLICY "Allow authenticated write on sync_jobs" ON "public"."sync_jobs" USING (true);



CREATE POLICY "Allow public read access on awards" ON "public"."awards" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public read access on collections" ON "public"."collections" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public read access on episodes" ON "public"."episodes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public read access on seasons" ON "public"."seasons" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow public read access to watch links" ON "public"."content_watch_links" FOR SELECT USING (true);



CREATE POLICY "Allow public read on sync_jobs" ON "public"."sync_jobs" FOR SELECT USING (true);



CREATE POLICY "Anyone can view cast" ON "public"."content_cast" FOR SELECT USING (true);



CREATE POLICY "Anyone can view crew" ON "public"."content_crew" FOR SELECT USING (true);



CREATE POLICY "Anyone can view people" ON "public"."people" FOR SELECT USING (true);



CREATE POLICY "Anyone can view published content" ON "public"."content" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Authenticated users can manage enrichment_queue" ON "public"."enrichment_queue" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage import_jobs" ON "public"."import_jobs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage sync_logs" ON "public"."sync_logs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage sync_settings" ON "public"."sync_settings" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for service role" ON "public"."api_usage_log" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for service role" ON "public"."enrichment_cycles" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for service role" ON "public"."quality_reports" USING (true) WITH CHECK (true);



CREATE POLICY "Only admins can access import_queue" ON "public"."import_queue" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can delete people" ON "public"."people" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Only admins can insert people" ON "public"."people" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can modify cast" ON "public"."content_cast" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can modify crew" ON "public"."content_crew" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can update people" ON "public"."people" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Public can read people" ON "public"."people" FOR SELECT USING (true);



CREATE POLICY "Public discussions are viewable by everyone" ON "public"."discussions" FOR SELECT USING (true);



CREATE POLICY "Public reviews are viewable by everyone" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "Service role full access" ON "public"."ai_validation_queue" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can create discussions" ON "public"."discussions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create reviews" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own favorites" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own favorites" ON "public"."favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can manage their own presets" ON "public"."import_presets" USING ((("auth"."uid"() = "created_by") OR ("created_by" IS NULL)));



CREATE POLICY "Users can update own favorites" ON "public"."favorites" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own favorites" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_validation_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_usage_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."awards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_cast" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_crew" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_watch_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrichment_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrichment_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."episodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quality_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."calculate_priority_score"("p_country_code" "text", "p_content_type" "text", "p_popularity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_priority_score"("p_country_code" "text", "p_content_type" "text", "p_popularity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_priority_score"("p_country_code" "text", "p_content_type" "text", "p_popularity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_queue_item"("max_attempts" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_queue_item"("max_attempts" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_queue_item"("max_attempts" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_api_logs"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."determine_region"("origin_country" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."determine_region"("origin_country" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."determine_region"("origin_country" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_api_usage_summary"("hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_api_usage_summary"("hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_api_usage_summary"("hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_complete_schema"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_complete_schema"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_complete_schema"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_incomplete_tv_shows"("limit_num" integer, "start_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_incomplete_tv_shows"("limit_num" integer, "start_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_incomplete_tv_shows"("limit_num" integer, "start_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quality_trend"("days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_quality_trend"("days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quality_trend"("days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_queue_attempts"("queue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_queue_attempts"("queue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_queue_attempts"("queue_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_content_already_imported"("p_tmdb_id" integer, "p_content_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_content_already_imported"("p_tmdb_id" integer, "p_content_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_content_already_imported"("p_tmdb_id" integer, "p_content_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_enrichment_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_enrichment_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_enrichment_queue_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pdf_job_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pdf_job_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pdf_job_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pdf_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pdf_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pdf_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_timestamp"() TO "service_role";
























GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."ai_validation_queue" TO "anon";
GRANT ALL ON TABLE "public"."ai_validation_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_validation_queue" TO "service_role";



GRANT ALL ON TABLE "public"."api_usage_log" TO "anon";
GRANT ALL ON TABLE "public"."api_usage_log" TO "authenticated";
GRANT ALL ON TABLE "public"."api_usage_log" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_api_errors" TO "anon";
GRANT ALL ON TABLE "public"."analytics_api_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_api_errors" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_api_hourly_usage" TO "anon";
GRANT ALL ON TABLE "public"."analytics_api_hourly_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_api_hourly_usage" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_api_performance" TO "anon";
GRANT ALL ON TABLE "public"."analytics_api_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_api_performance" TO "service_role";



GRANT ALL ON SEQUENCE "public"."content_gdvg_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."content_gdvg_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."content_gdvg_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."content" TO "anon";
GRANT ALL ON TABLE "public"."content" TO "authenticated";
GRANT ALL ON TABLE "public"."content" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_batch_imports" TO "anon";
GRANT ALL ON TABLE "public"."analytics_batch_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_batch_imports" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_enrichment_coverage" TO "anon";
GRANT ALL ON TABLE "public"."analytics_enrichment_coverage" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_enrichment_coverage" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_quality_scores" TO "anon";
GRANT ALL ON TABLE "public"."analytics_quality_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_quality_scores" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_quality_timeline" TO "anon";
GRANT ALL ON TABLE "public"."analytics_quality_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_quality_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_regional_distribution" TO "anon";
GRANT ALL ON TABLE "public"."analytics_regional_distribution" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_regional_distribution" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_slow_endpoints" TO "anon";
GRANT ALL ON TABLE "public"."analytics_slow_endpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_slow_endpoints" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_source_distribution" TO "anon";
GRANT ALL ON TABLE "public"."analytics_source_distribution" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_source_distribution" TO "service_role";



GRANT ALL ON TABLE "public"."awards" TO "anon";
GRANT ALL ON TABLE "public"."awards" TO "authenticated";
GRANT ALL ON TABLE "public"."awards" TO "service_role";



GRANT ALL ON TABLE "public"."collections" TO "anon";
GRANT ALL ON TABLE "public"."collections" TO "authenticated";
GRANT ALL ON TABLE "public"."collections" TO "service_role";



GRANT ALL ON TABLE "public"."content_cast" TO "anon";
GRANT ALL ON TABLE "public"."content_cast" TO "authenticated";
GRANT ALL ON TABLE "public"."content_cast" TO "service_role";



GRANT ALL ON TABLE "public"."content_crew" TO "anon";
GRANT ALL ON TABLE "public"."content_crew" TO "authenticated";
GRANT ALL ON TABLE "public"."content_crew" TO "service_role";



GRANT ALL ON TABLE "public"."content_watch_links" TO "anon";
GRANT ALL ON TABLE "public"."content_watch_links" TO "authenticated";
GRANT ALL ON TABLE "public"."content_watch_links" TO "service_role";



GRANT ALL ON TABLE "public"."discussions" TO "anon";
GRANT ALL ON TABLE "public"."discussions" TO "authenticated";
GRANT ALL ON TABLE "public"."discussions" TO "service_role";



GRANT ALL ON TABLE "public"."enrichment_cycles" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_cycles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."enrichment_cycles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."enrichment_cycles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."enrichment_cycles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."enrichment_queue" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_queue" TO "service_role";



GRANT ALL ON TABLE "public"."episodes" TO "anon";
GRANT ALL ON TABLE "public"."episodes" TO "authenticated";
GRANT ALL ON TABLE "public"."episodes" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."import_jobs" TO "anon";
GRANT ALL ON TABLE "public"."import_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."import_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."import_presets" TO "anon";
GRANT ALL ON TABLE "public"."import_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."import_presets" TO "service_role";



GRANT ALL ON TABLE "public"."import_queue" TO "anon";
GRANT ALL ON TABLE "public"."import_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."import_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."people_gdvg_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."people_gdvg_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."people_gdvg_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."quality_reports" TO "anon";
GRANT ALL ON TABLE "public"."quality_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_reports" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."sync_jobs" TO "anon";
GRANT ALL ON TABLE "public"."sync_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sync_settings" TO "anon";
GRANT ALL ON TABLE "public"."sync_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































