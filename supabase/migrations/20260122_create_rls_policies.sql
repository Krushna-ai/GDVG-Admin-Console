-- Migration: Create Row Level Security policies for all tables
-- Date: 2026-01-22

-- Content policies
DROP POLICY IF EXISTS "Anyone can view published content" ON public.content;
CREATE POLICY "Anyone can view published content"
  ON public.content FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins can do everything with content" ON public.content;
CREATE POLICY "Admins can do everything with content"
  ON public.content FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Import queue policies  
DROP POLICY IF EXISTS "Only admins can access import_queue" ON public.import_queue;
CREATE POLICY "Only admins can access import_queue"
  ON public.import_queue FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- People policies
DROP POLICY IF EXISTS "Anyone can view people" ON public.people;
CREATE POLICY "Anyone can view people"
  ON public.people FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can insert people" ON public.people;
CREATE POLICY "Only admins can insert people"
  ON public.people FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can update people" ON public.people;
CREATE POLICY "Only admins can update people"
  ON public.people FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can delete people" ON public.people;
CREATE POLICY "Only admins can delete people"
  ON public.people FOR DELETE
  USING (public.is_admin());

-- Content cast policies
DROP POLICY IF EXISTS "Anyone can view cast" ON public.content_cast;
CREATE POLICY "Anyone can view cast"
  ON public.content_cast FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can modify cast" ON public.content_cast;
CREATE POLICY "Only admins can modify cast"
  ON public.content_cast FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Content crew policies
DROP POLICY IF EXISTS "Anyone can view crew" ON public.content_crew;
CREATE POLICY "Anyone can view crew"
  ON public.content_crew FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can modify crew" ON public.content_crew;
CREATE POLICY "Only admins can modify crew"
  ON public.content_crew FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin users policies
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
CREATE POLICY "Admins can view admin_users"
  ON public.admin_users FOR SELECT
  USING (public.is_admin());
