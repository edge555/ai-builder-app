-- Fix: add unique constraints identified in adversarial security review
--
-- 1. UNIQUE(workspace_id, email) on members — prevents duplicate invites to the
--    same workspace and ensures the 23505 duplicate-detection in the API works.
--
-- 2. UNIQUE on organizations.admin_user_id — prevents the self-provision endpoint
--    from creating multiple orgs for the same user under concurrent requests.

ALTER TABLE public.members
  ADD CONSTRAINT members_workspace_email_unique UNIQUE (workspace_id, email);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_admin_user_id_unique UNIQUE (admin_user_id);
