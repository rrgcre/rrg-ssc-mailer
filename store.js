# RRG SSC Mailer

A small service that powers the **Submit & Email** button on the RRG Site Selection Criteria form. When a rep submits, it:

1. Renders the completed SSC into a **sharp, branded PDF** (the same look as the client-facing deal doc).
2. **Emails the PDF** — To the tenant rep, **CC van@rrgcre.com** — with the file attached.

No manual attaching, no white-screen mailto. The rep clicks Submit and it's done.

---

## What's in here

```
server.js         Express service + /api/send-ssc endpoint
mailer.js         PDF render (headless Chromium) + email send
template.js       The branded PDF layout
fonts/            Archivo + Inter (embedded in the PDF)
public/           The form, served by this service (ssc_form.html)
Dockerfile        Reliable one-step deploy (Chromium included)
.env.example      Configuration template
test-local.js     Optional: end-to-end test against a local mail sink
```

---

## 1. Run it locally (to try it)

Requires Node 18+.

```bash
npm install
cp .env.example .env      # then edit .env with your SMTP details
npm start
```

Open **http://localhost:8787/ssc_form.html**, fill the form (or click **Load sample**), and hit **Submit & Email**. The served form auto-targets this service, so it just works.

> The form served from `public/` automatically points at whatever origin serves it. The standalone `ssc_form.html` (the one in your artifacts) keeps working as before with the manual copy panel until you point it at this service — see step 4.

---

## 2. Configure email (SMTP)

Fill these in `.env`. For **@rrgcre.com on Google Workspace** (recommended):

1. Turn on 2-Step Verification for van@rrgcre.com.
2. Create an **App Password**: https://myaccount.google.com/apppasswords
3. Set:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=van@rrgcre.com
SMTP_PASS=the-16-char-app-password
MAIL_FROM=van@rrgcre.com
CC_ALWAYS=van@rrgcre.com
```

SendGrid, Postmark, Resend, and Mailgun also work — just use their SMTP host/user/pass.

---

## 3. Deploy it (so the team can use it)

The **Dockerfile** is the reliable path because it includes Chromium and its system libraries.

**Render / Railway / Fly.io (any Docker host):**
1. Push this folder to a Git repo.
2. Create a new **Web Service** from that repo, select **Docker**.
3. Add the environment variables from your `.env` (SMTP_*, CC_ALWAYS, MAIL_FROM, ALLOW_ORIGIN).
4. Deploy. You'll get a URL like `https://rrg-ssc.onrender.com`.

Health check: visiting `/health` should return `{"ok":true}`.

---

## 4. Point the form at the service

Two options:

**A. Serve the form from this service (simplest).** It's already in `public/ssc_form.html` and auto-targets its own origin. Just share `https://your-service-url/ssc_form.html`.

**B. Host the form elsewhere.** Open `ssc_form.html`, find this line near the top of the `<script>`:

```js
window.RRG_API = window.RRG_API || "";
```

Set it to your deployed service URL:

```js
window.RRG_API = "https://your-service-url";
```

Also set `ALLOW_ORIGIN` in `.env` to the form's website so only it can call the API.

If `RRG_API` is left blank, the form falls back to the manual copy/email panel — so it never breaks, it just isn't automatic until this is set.

---

## Keep it internal to RRG (password gate)

This is the part that actually protects the tool — **don't email the raw HTML
file around.** Host it here and put a password in front of it.

Add two values to your `.env` (or your host's environment variables):

```
APP_USER=rrg
APP_PASS=some-strong-shared-password
```

Now anyone opening the form URL gets a login prompt and can't see the form — or
use the send API — without those credentials. Share them with your reps only.
Leave both blank to turn the gate off (e.g., for local testing).

That's the moat: the file lives on your server behind a login, and reps use it
at a private link instead of passing the file around. The
"Proprietary & Confidential — internal RRG use only" notice on the form backs it
up legally.

---

## Running log of all entries

Every submission — from **both** the Site Selection Criteria form and the
Seller Screening form — is written to a persistent log on the server. Nothing
is ever lost, even if an email fails to send.

**See it in a browser:** open `https://your-service-url/log` (behind the same
RRG login). You get a clean, newest-first table of every submission — form type,
business/concept name, market, rep, rep email, and a one-line highlight of the
key answers. Counts for SSC vs. Seller are at the top.

**Export it:** the **Download CSV** button (or `https://your-service-url/log.csv`)
gives you a spreadsheet you can sort, filter, or drop into your CRM.

Two files are kept under `DATA_DIR`:

```
submissions.jsonl   one full JSON record per line (the complete payload)
submissions.csv     one flat summary row per line (opens in Excel)
```

**Important — keep the log from getting wiped.** Most hosts (Render, Railway,
Fly) use an *ephemeral* filesystem that resets on every deploy. Point
`DATA_DIR` at a **mounted persistent disk** so the log survives. The included
`render.yaml` already does this (a 1 GB disk mounted at `/var/data`, with
`DATA_DIR=/var/data`). On other hosts, attach a volume and set `DATA_DIR` to it.

The Seller Screening form (served at `/seller_screening.html`) posts to
`/api/log` on submit, so it's captured without needing the email pipeline. The
SSC form logs automatically through its send endpoint.

---

## Endpoints

- `POST /api/send-ssc` — SSC form submit. JSON body (`concept`, `preparedBy`, `date`, `repEmail`, `sections[]`). Renders + emails the branded PDF **and** logs the entry. Returns `{ ok, messageId, filename }`. Requires a valid `repEmail`.
- `POST /api/log` — lightweight logger for the Seller Screening form (and any form). JSON body with a `formType` (`"seller"` / `"ssc"`) plus the same payload shape. Logs the entry and returns `{ ok, timestamp }`. No email.
- `GET /log` — HTML table of the running log (password-gated).
- `GET /log.csv` — CSV export of the running log (password-gated).
- `GET /health` — open health check, returns `{ ok: true }`.

---

## Notes

- Attachment size is tiny (a few hundred KB), well within any provider's limits.
- The PDF is generated fresh from each submission — no data is stored by this service.
- To change who's always CC'd, edit `CC_ALWAYS`.
