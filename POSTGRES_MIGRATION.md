# FullServe → Managed Postgres backup (Phase 1)

This gives your **records** — agreements, companies, contacts, deals, rooms, and every
other dataset — automated, off-box backups via managed Postgres, without changing how
the app reads or writes data.

## The model: disk-first, Postgres as a durable replica

- **Primary store = the JSON files on the `/var/data` persistent disk.** The app reads
  and writes them synchronously, exactly as it always has. This is rock-solid and always
  boots — there is nothing that can hang or "fall back."
- **Postgres = a continuously-updated backup replica.** Every store write is mirrored to
  managed Postgres in the background, and on boot the app reconciles: it pushes the live
  disk up so the backup matches it, and — critically — **restores the disk from Postgres
  if the disk is ever lost or emptied.** The app never *reads* from Postgres in normal
  operation, so a database hiccup can never take the app offline.

This is the same pattern the object-storage layer (Phase 2) uses for binary files:
disk-first, async replicate, restore-on-loss. Records and documents are handled the same
way, which keeps the whole system predictable.

> An earlier version of this made Postgres the *source of truth* and loaded it into memory
> at boot. That boot step was fragile in the container and could make the app fall back to
> disk. The current design removes it entirely.

## Turn it on (Render dashboard)

You do these steps — I never handle your database credentials.

**Blueprint-managed service (yours is):** the `render.yaml` already declares the
`rrg-postgres` database and wires `DATABASE_URL`. Pushing it runs a Blueprint sync that
provisions the database. If it's already provisioned (it is), there's nothing more to do
here.

**Manual service:** Render → **New → Postgres** (same region as the web service, a paid
plan for real data), copy its **Internal Database URL**, and add it to the web service as
`DATABASE_URL`, then save.

## Verify it worked

Open `https://rrg-ssc-mailer.onrender.com/health`. You want:

```json
{ "ok": true, "storage": "files", "pgBackup": "on", "pgPending": 0 }
```

`"storage":"files"` is correct and expected — the disk is the live store. `"pgBackup":"on"`
means the Postgres replica is active and receiving writes. (`"off"` means `DATABASE_URL`
isn't set or the DB isn't reachable — check the deploy log for a line starting `[PG]`.)

In the deploy logs you'll see `[PG] Postgres backup replica active…` and, shortly after
boot, `[PG] boot reconcile — pushed N, restored 0`. That `pushed N` line is your live disk
being copied into the backup.

## What this protects

If the `/var/data` disk is ever lost or replaced, the next boot restores every record from
Postgres automatically. Managed Postgres also takes **automated daily backups** with
**point-in-time recovery** on paid plans, restorable from the database dashboard — the
off-box durability flat files never had.

## Rollback

Remove `DATABASE_URL` and redeploy. The app keeps running on disk exactly as before; only
the backup replication stops. Nothing is lost.
