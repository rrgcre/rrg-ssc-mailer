# FullServe → Managed Postgres (Phase 1)

This moves your **book of business** — agreements, companies, contacts, deals, rooms,
and every other record — off loose JSON files and onto **managed Postgres** with
automated backups and point-in-time recovery. It is designed so you can turn it on
with **zero data loss and an easy rollback**.

---

## What changed in the code

- **`pgstore.js`** — a Postgres-backed data store. Records are held in an in-memory
  cache (so the app's reads stay instant and synchronous), and every write streams
  through to Postgres *and* is mirrored to the `/var/data` disk as a warm fallback.
- **`pgboot.js`** — a tiny boot loader that reads the current snapshot from Postgres
  synchronously at startup.
- **`server.js`** — now picks its storage in priority order at boot:
  1. **Postgres** if `DATABASE_URL` is set (the new default target),
  2. SQLite if `USE_SQLITE=1`,
  3. plain JSON files otherwise.
  If Postgres is ever unreachable, it logs the reason and safely falls back — the app
  always boots.
- **`render.yaml`** — declares a managed Postgres database (`rrg-postgres`) and wires
  `DATABASE_URL` into the web service.
- **`package.json`** — adds the `pg` driver.

**Postgres is the source of truth. The `/var/data` disk is kept as a live mirror.**
On the very first boot with Postgres connected, the app **imports everything already
on `/var/data` into Postgres automatically** (one-time migration). Nothing is deleted.

---

## Turn it on (in the Render dashboard)

You do these steps — I never handle your database credentials.

### If your service was created from the Blueprint (render.yaml)
1. In Render, open your Blueprint and **Apply / Sync** the updated `render.yaml`.
   Render will create the `rrg-postgres` database and inject `DATABASE_URL` for you.
2. Confirm the plan: `basic-256mb` (~$6/mo, includes daily backups + PITR). Change it
   in `render.yaml` if you want a bigger plan.
3. Deploy.

### If your service was created manually (connect-a-repo)
1. **Create the database:** Render dashboard → **New +** → **Postgres**.
   - Name: `rrg-postgres` · Database: `rrg` · User: `rrg`
   - Region: **same region as your web service** (so they talk over the fast internal
     network).
   - Plan: **basic-256mb** or higher (avoid `free` for real data — it expires).
   - Create it and wait until it's **Available**.
2. **Copy the Internal Database URL** from the database's page (starts with
   `postgresql://…`). Use the **Internal** one, not External.
3. **Add it to the web service:** your web service → **Environment** → **Add
   Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: *(paste the Internal Database URL)*
4. **Save changes** → this triggers a deploy.

---

## Verify it worked (2 minutes)

1. **Storage check:** open `https://rrg-ssc-mailer.onrender.com/health`.
   You should see:
   ```json
   { "ok": true, "storage": "postgres", "pgPending": 0 }
   ```
   `"storage": "postgres"` means you're live on the database. (If it says `"files"`,
   `DATABASE_URL` isn't set or the DB isn't reachable — check the deploy logs for a
   line beginning `[DB]`.)
2. **First-boot import:** in the deploy logs you'll see one line like
   `[DB] first-boot migration imported N store(s) into Postgres: companies.json:…,
   agreements.json:…`. That's your existing data being copied in.
3. **The real test — data survives a deploy:**
   - Create a quick test agreement and open its signing link. It should load.
   - Trigger one manual **redeploy** in Render.
   - Reopen the **same** signing link. It should still load. That's the proof the old
     "Link not found after deploy" problem is gone for good.

---

## Rollback (if you ever need it)

Remove the `DATABASE_URL` environment variable and redeploy. The app returns to the
JSON-files-on-disk behavior instantly, using the mirror on `/var/data`. Nothing is
lost because every write was mirrored there too.

---

## Backups

With managed Postgres, Render takes **automated daily backups** and supports
**point-in-time recovery** on paid plans — restorable from the database's dashboard.
This is the durability guarantee flat files never had.

---

## What's next (Phase 2)

The **binary files** — executed PDF copies, signature images, uploaded templates,
logos, room documents — still live on the `/var/data` disk. Phase 2 moves those to
object storage (Cloudflare R2 or S3; the AWS S3 SDK is already a dependency) so the
documents themselves are just as durable and backed up as the records. That's a
separate, focused change we can do next.
