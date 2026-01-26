-- Migration: Create admin_users table and is_admin function
-- Date: 2026-01-22

CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE id = auth.uid()
  );
END;
$$;
