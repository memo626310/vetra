# VETRA database backups on Windows

The backup script writes verified PostgreSQL custom-format archives for the VETRA Core database and the shared clinic database to `Documents\VetraBackups` by default. It retains successful backups for 30 days and logs success or failure without printing credentials. Supabase Storage file contents are not included.

## Prerequisites

1. Install PostgreSQL command-line tools that provide `pg_dump` and `pg_restore`, then make sure both commands are on PATH. The script does not install database software.
2. Create a local-only `.env.backup.local` file in the repository root by copying `scripts/backup-vetra.env.example`.
3. Set `VETRA_CORE_DB_PASSWORD` in that local file. Get the Core project database password from its Supabase Dashboard. The shared clinic password and project ref are read from `.env.local` and are never printed.
4. If the direct database host is unavailable from this network, fill the optional host, port, and user values in `.env.backup.local` with the project session-pooler connection details.

## First run and schedule

Run a one-time backup and verify it creates two archive files and a manifest:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-vetra.ps1
```

Only after the first run succeeds, register the daily 2:00 AM Windows Task Scheduler task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-vetra.ps1 -InstallTask
```

The task runs while the current Windows account is logged in and starts missed runs when available. Remove it with `-UninstallTask`.

The archives contain sensitive clinic, medical, and financial data. Keep the Windows account protected and copy important backups to a separate disk for device-failure recovery.
