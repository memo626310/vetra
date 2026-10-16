# VETRA push notifications

Push subscriptions are shared by pet owners and clinic staff. The browser stores its subscription in the VETRA CORE `vetra_push_subscriptions` table; the server authenticates owners with their Client ID and phone, and clinics with their VETRA session.

## One-time setup

1. Run `node scripts/generate-vapid-keys.mjs` to create local push secrets in the ignored `.env.local` file. Keep `VAPID_PRIVATE_KEY` and `VETRA_PUSH_CRON_SECRET` on the server only. Set these variables in the deployment environment:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (a contact URI such as `mailto:push@vetra.top`)
   - `VETRA_PUSH_CRON_SECRET`
2. Add `VETRA_CORE_SUPABASE_SERVICE_ROLE_KEY` to the local and deployment server environments. Get this server-only key from the VETRA CORE Supabase project. Never expose it as a `NEXT_PUBLIC_` variable.
3. Run `supabase/migrations/20261017_vetra_push_subscriptions.sql` on the **VETRA CORE** database. Do not run it on clinic tenant databases.
4. Restart the Next.js server after changing environment variables. Push requires HTTPS in production; localhost is accepted by browsers for local development. On iOS, the site must be installed to the Home Screen before the browser can receive notifications.

## In the app

- Owners manage push from the bell in their VETRA Care header.
- Clinic users manage push from the bell in the clinic dashboard header.
- Each account can test the current device and turn its subscription off. Turning it off removes both the browser subscription and its Core database row.
- The service worker displays push payloads and opens only same-origin VETRA routes when clicked.
- Appointment booking/rescheduling/cancellation notifies the clinic; clinic confirmation, rescheduling, and cancellation notify the pet owner. Delivery failures do not undo the appointment change.
- The owner can set a reminder for the next vaccine dose. Configure your existing scheduler to call `POST /api/push/reminders/dispatch` hourly with `Authorization: Bearer <VETRA_PUSH_CRON_SECRET>` so due reminders are delivered.

If the scheduler is not configured, appointment notifications and test notifications still work, but vaccine reminders remain queued.
