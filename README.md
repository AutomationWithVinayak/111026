# Live Location Share — Demo

This is a minimal demo that lets a sender open a link to share their live location and viewers open a link to watch it in real time.

Features
- Create a session and get two links: a sender link (open on the device sending location) and a viewer link (open on other devices to watch).
- Live updates via Socket.IO and a Leaflet map using OpenStreetMap tiles.

Quick start (PowerShell on Windows):

```powershell
cd d:\locationtracker
npm install
npm start
# open http://localhost:3000
```

Notes
- This is an in-memory demo (no persistence). For production: add HTTPS, authentication, room limits, and persistence (DB) or TURN servers depending on approach.
- The sender page uses the browser Geolocation API — the device must allow location sharing.

Consent-based redirect usage
---------------------------

This project includes a consent-based redirect page at `/r` that can be used to forward a user to any target URL while optionally requesting their explicit browser geolocation permission. Example:

	/r?t=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dxyz

How it works (privacy-first):
- The page asks the visitor for permission to share precise location.
- If the visitor consents, their browser shares coordinates which are sent to the server and then the visitor is redirected to the requested target.
- If the visitor declines or the browser doesn't support geolocation, they are still forwarded to the target and a record noting the decline is saved.

Important legal & ethical note
-----------------------------
Do not use this mechanism to track people without their informed consent. The code above intentionally requires explicit browser permission for precise location. Covert tracking is illegal in many jurisdictions and a serious invasion of privacy. Use this feature only where you have a lawful basis and the user's clear consent.
