# Set up a new machine (laptop, desktop, wherever)

Everything for this project lives in **GitHub**, not on any one computer. A machine is just a
place to hold a copy of the code and push changes up. Any computer can be that place — follow
this once and you're working exactly like before.

There are only three things a machine needs: **GitHub Desktop**, the **Claude desktop app**, and
a **clone of the repo**.

---

## First-time setup on a new machine

1. **Install GitHub Desktop** — https://desktop.github.com — and sign in with the same GitHub
   account the project lives under.

2. **Clone the repo.** In GitHub Desktop: `File → Clone repository…`, pick **`rrg-ssc-mailer`**
   from your list, and choose where to put it (the default `Documents\GitHub\rrg-ssc-mailer` is
   fine). This downloads the whole project.

3. **Install the Claude desktop app** and sign in. This is what lets Claude read and write the
   project files during a session.

4. **Connect the repo folder in Claude.** In a Cowork session, grant access to the
   `rrg-ssc-mailer` folder you just cloned. That's the drop-off point — Claude writes changed
   files straight into it.

5. **Test it.** Ask Claude to make a tiny change, confirm the file updates in GitHub Desktop's
   "Changes" tab, then commit and push. If it shows up, you're set.

---

## The daily rhythm (every machine, every time)

1. **Pull first.** Open GitHub Desktop and click **Pull origin** (or `Fetch → Pull`) before you
   start. This grabs anything you pushed from another machine so you're on the latest.
2. **Work with Claude.** Claude writes changed files into your local `rrg-ssc-mailer` folder.
3. **Commit + push.** In GitHub Desktop: write a short summary, **Commit to main**, then **Push
   origin**. Nothing is live until you push.
4. Render redeploys automatically from GitHub a minute or two after the push.

**The one rule that keeps two machines from fighting:** always **Pull before you start** and
**Push when you finish**. Do that and you can bounce between the desktop and the laptop freely.

---

## Moving from one machine to another

- On the machine you're leaving: **commit and push** everything. Check GitHub Desktop shows
  "No local changes" and that you've pushed.
- On the machine you're going to: **pull** before you touch anything.

If you forget and edit the same file on both without pushing, GitHub Desktop will flag a
conflict — not the end of the world, but easier to just avoid by pulling/pushing each time.

---

## Continuing a conversation across devices

The Claude session itself lives in the cloud, so you can open the Claude app on the laptop (or
your phone) and pick up the same conversation. The only thing that needs a real computer with
the repo cloned on it is the **file-writing step** — that's reaching onto a disk. From a phone
with no repo you can still talk, plan, and get files to download, but to write straight into the
project Claude needs the desktop app on a machine that has the clone.

---

## Quick troubleshooting

- **Claude can't see or write the files** → make sure the Claude desktop app is open and the
  `rrg-ssc-mailer` folder is connected in the session.
- **Your changes aren't live on the site** → they only deploy after you **Push** in GitHub
  Desktop. A commit alone isn't enough.
- **The laptop is missing recent work** → you pushed from the other machine but didn't **Pull**
  here. Pull and it appears.
- **Clone is huge / slow the first time** → that's normal; it's a one-time download. After that
  it only syncs what changed.
