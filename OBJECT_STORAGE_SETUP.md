# FullServe → Object Storage for Binary Files (Phase 2)

This is the second half of the durability project. Phase 1 put your **records**
(agreements, contacts, deals, rooms) in managed Postgres with backups. Phase 2
does the same for your **binary files** — executed agreement PDFs, signature
images, agreement templates, data-room documents, uploaded files, photos and
logos — by mirroring them to S3-compatible object storage.

Today those files live on the `/var/data` disk. The disk survives deploys but
has no automated backups and is a single point of failure. After this, every
binary is continuously copied to a bucket and can be restored automatically.

---

## How it works (already built)

- The disk stays the working filesystem — **reads are unchanged**, so serving a
  PDF or image behaves exactly as before.
- Every binary **write and delete** is additionally mirrored to the bucket in the
  background (`blobstore.js`).
- On boot the app **reconciles**: it uploads any disk files the bucket is missing
  (first-run migration) and downloads any files the disk is missing (disaster
  restore). Idempotent — safe to run every boot.
- It is **inert until configured**: with no bucket set, the app runs exactly as
  it does today, on disk only. Nothing changes until you set the env vars below.

This reuses the **same** S3 configuration your seller-interview-video feature
already uses, so it's one bucket for the whole app.

---

## Recommended: Cloudflare R2

R2 is S3-compatible, cheap, and — importantly for serving PDFs and images — has
**no egress fees**. AWS S3 works too (see the note at the end).

1. **Create a bucket.** Cloudflare dashboard → **R2** → **Create bucket** →
   name it e.g. `rrg-assets`. (If R2 asks you to add a payment method, that's
   normal; usage at your scale is pennies.)
2. **Create an API token.** R2 → **Manage R2 API Tokens** → **Create API Token**
   → permission **Object Read & Write** → scope it to your bucket → create.
   Copy the three values it shows:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** (looks like `https://<accountid>.r2.cloudflarestorage.com`)
3. **Set these environment variables** on your Render web service
   (Service → **Environment** → Add). I never see these values — you enter them.

   | Key | Value |
   |-----|-------|
   | `S3_BUCKET` | `rrg-assets` |
   | `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
   | `AWS_ACCESS_KEY_ID` | *(the R2 Access Key ID)* |
   | `AWS_SECRET_ACCESS_KEY` | *(the R2 Secret Access Key)* |
   | `AWS_REGION` | `auto` |

4. **Save** → Render redeploys. On first boot the app uploads your existing
   files to the bucket.

---

## Verify it worked

1. Open `https://rrg-ssc-mailer.onrender.com/health`. You should now see:
   ```json
   { "ok": true, "storage": "postgres", "blobStore": "on", "blobPending": 0 }
   ```
   `"blobStore": "on"` means object storage is active. (`"off"` means the env
   vars aren't set or aren't readable.)
2. In the deploy logs, look for:
   `[BLOB] Object storage active — binary assets mirrored to the bucket.`
   and shortly after boot:
   `[BLOB] boot reconcile — uploaded N, restored 0`
   That `uploaded N` line is your existing files being copied up the first time.
3. In the Cloudflare R2 bucket browser you'll see folders mirroring the app's
   layout: `agreedocs/`, `rooms/`, `agreetemplates/`, `documents/`, `brand_logo.png`, etc.

---

## What this protects

After this, if the `/var/data` disk is ever lost or replaced, the next boot
restores every executed PDF, signature, template, and document from the bucket
automatically. Combined with Phase 1's Postgres backups, your entire book of
business — records **and** documents — is now durable and recoverable.

---

## Rollback

Remove `S3_BUCKET` and redeploy. The app returns to disk-only behavior instantly.
Nothing is lost — the disk still holds every file (the bucket was a mirror).

---

## Using AWS S3 instead of R2

Everything is the same except:
- Create an S3 bucket and an IAM user/key with read/write to it.
- **Do not** set `S3_ENDPOINT` (leave it unset — that's what selects AWS).
- Set `AWS_REGION` to the bucket's real region (e.g. `us-east-2`).
- Set `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` as above.

Note AWS S3 charges egress (data served out), which R2 does not — a reason to
prefer R2 when the files are PDFs/images served to clients.
