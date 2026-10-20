# ArtScout

Art residencies across the Arab world, found and checked by Badriyah's scout.
Live at **https://badriyahs.github.io/artscout/** (password screen; same password as Badriyah's Tasks).

## How it fits together

- **The scout** is the scheduled task *ArtScout: art residencies in the Arab world* (Claude desktop app, Sunday, Tuesday and Thursday at 8:20 AM).
  It searches, verifies each call page, writes `~/Documents/BadriyahsTasks-backup/artscout-today.json`, and runs
  `~/Documents/BadriyahsTasks-backup/artscout_write.py`, the same way the daily Gulf scout uses `scout_write.py`.
- **The data** lives in the same Firebase database as Badriyah's Tasks (`badriyahstasks`), collection `artscout`.
  The doc `_meta` records the last run. Each residency's `mine` field is her own status (Saved, Applying, Applied, Accepted, Not for me);
  only this site writes it, and the scout never changes it.
- **This site** (`index.html`, `app.js`, `styles.css`) reads that collection and lets her filter by region, country, deadline and funding.
  `lock.js` is the password screen, shared with Badriyah's Tasks.

## One-time Firebase rule

The collection needs this line inside the `match /databases/{database}/documents { ... }` block of the Firestore rules
(Firebase console → Firestore Database → Rules → Publish):

```
match /artscout/{id} { allow read, write: if true; }
```

Like the rest of the Tasks database, this is open to anyone who has the project key; the password screen is a deterrent, not strong security.

## Handy commands

```bash
python3 ~/Documents/BadriyahsTasks-backup/artscout_write.py --list
```
