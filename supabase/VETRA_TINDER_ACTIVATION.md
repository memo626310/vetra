# VETRA Tinder activation

The application code now supports independent verified-email accounts, separate pet profiles, pending listing submissions, moderation, adoption inquiries, mutual breeding interest, in-app messages, notifications, reports, blocks, social profiles, community posts, image attachments, follows, likes, comments, saves, and self-service deletion. The database and email-provider steps below must be completed before these flows can run against production.

## 1. Apply Core database migrations

In the **VETRA CORE** Supabase project, run these files in order from the SQL Editor if they have not already been applied:

1. `migrations/20261018_vetra_adoption_listings.sql`
2. `migrations/20261019_vetra_match_workflows.sql`
3. `migrations/20261020_vetra_match_social.sql`

The workflow migrations add the isolated account/profile tables, secure interaction and moderation tables, updated breeding safety policy, limited public profile-column access, and the `vetra-match-pets` image bucket. The social migration adds the community feed and its profile, follow, post, like, comment, save, and notification data. It does not modify clinic pet or medical records.

## 2. Enable verified email sign-in

In Supabase Auth, enable email sign-in and new-user sign-ups, configure email OTP/magic-link delivery, and add the app's production callback URL to the Auth redirect allowlist:

`https://YOUR_APP_HOST/client-interface/*/match/auth/callback`

Add the local development callback separately when testing locally. The app constructs the callback from the current origin. Phone sign-in is intentionally not offered because no SMS provider is configured.

The production Next.js deployment needs the same Core URL, publishable key, and server-only `VETRA_CORE_SUPABASE_SERVICE_ROLE_KEY` values used by the API routes. Never expose the service-role key in a `NEXT_PUBLIC_` variable.

## 3. Assign trusted reviewers

Only explicitly assigned, verified Core users can open `/dashboard/match-moderation`. After the reviewer signs up and verifies their account, run this in the Core SQL Editor with their confirmed email:

```sql
insert into public.vetra_match_moderators (user_id, role)
select id, 'veterinarian'
from auth.users
where lower(email) = lower('REPLACE_WITH_VERIFIED_REVIEWER_EMAIL')
on conflict (user_id) do update
set role = excluded.role, active = true;
```

Use `moderator` for adoption and report review, `veterinarian` for breeding health/reproductive/welfare approval, and `admin` only for a platform administrator. Do not grant reviewer access to unverified or untrusted accounts.

## 4. Complete policy ownership details

The in-app Terms and Privacy pages are an operational baseline, not a jurisdiction-specific legal review. Before public launch, replace the generic VETRA support reference with the responsible legal entity and a monitored privacy/contact channel, then have the final policy reviewed for the countries where the service will operate.
