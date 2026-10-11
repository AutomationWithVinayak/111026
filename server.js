const path = require('path');
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);
const sharedLocations = new Map();
const locationViewerIds = new Map();
const LOCATION_SHARE_TTL = 60 * 60 * 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// simple health check for automation/quick tests
app.get('/health', (req, res) => {
  res.type('text').send('OK');
});

function removeExpiredLocationShares() {
  const now = Date.now();
  for (const [shareId, share] of sharedLocations) {
    if (share.expiresAt <= now) {
      sharedLocations.delete(shareId);
      locationViewerIds.delete(share.viewerId);
    }
  }
}

app.post('/create-redirect', (req, res) => {
  let target;
  try {
    target = new URL(req.body && req.body.target);
  } catch {
    return res.status(400).json({ error: 'Enter a valid destination URL.' });
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).json({ error: 'Destination must use HTTP or HTTPS.' });
  }

  removeExpiredLocationShares();
  const shareId = uuidv4();
  const viewerId = uuidv4();
  sharedLocations.set(shareId, {
    viewerId,
    expiresAt: Date.now() + LOCATION_SHARE_TTL,
    completed: false,
    location: null
  });
  locationViewerIds.set(viewerId, shareId);

  res.json({
    redirectUrl: `/r?t=${encodeURIComponent(target.href)}&share=${shareId}`,
    viewerUrl: `/location-report/${viewerId}`
  });
});

// consent-based redirect endpoint
// Usage: /r?t=<encoded-target-url>
app.get('/r', (req, res) => {
  // serve a client page that asks for consent and then reports location
  res.sendFile(path.join(__dirname, 'public', 'consent-redirect.html'));
});

// receive reported location (only when user consents in the browser)
app.post('/report', (req, res) => {
  try {
    const payload = req.body || {};
    removeExpiredLocationShares();
    const share = typeof payload.shareId === 'string' ? sharedLocations.get(payload.shareId) : null;
    if (share && !share.completed) {
      share.completed = true;
      const coords = payload.coords || {};
      const latitude = Number(coords.latitude);
      const longitude = Number(coords.longitude);
      if (payload.granted === true && Number.isFinite(latitude) && Number.isFinite(longitude) &&
          latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        share.location = {
          latitude,
          longitude,
          accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
          timestamp: payload.timestamp || new Date().toISOString()
        };
      }
    }
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const entry = {
      timestamp: new Date().toISOString(),
      ip,
      userAgent: ua,
      payload
    };
    const file = path.join(__dirname, 'reports.jsonl');
    fs.appendFile(file, JSON.stringify(entry) + os.EOL, (err) => {
      if (err) console.error('failed to write report', err);
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.get('/location-report/:viewerId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'location-report.html'));
});

app.get('/api/location-report/:viewerId', (req, res) => {
  removeExpiredLocationShares();
  const shareId = locationViewerIds.get(req.params.viewerId);
  const share = shareId && sharedLocations.get(shareId);
  if (!share) return res.status(404).json({ status: 'expired' });
  if (!share.completed) return res.json({ status: 'waiting' });
  if (!share.location) return res.json({ status: 'not_shared' });
  res.json({ status: 'received', location: share.location });
});

// create new tracking session
app.post('/create', (req, res) => {
  const id = uuidv4();
  const origin = req.headers.host ? `${req.protocol || 'http'}://${req.headers.host}` : '';
  res.json({
    id,
    sendUrl: `/send/${id}`,
    trackUrl: `/track/${id}`
  });
});

app.get(['/send/:id', '/track/:id'], (req, res) => {
  const isSender = req.path.startsWith('/send/');
  res.sendFile(path.join(__dirname, 'public', isSender ? 'sender.html' : 'viewer.html'));
});

io.on('connection', (socket) => {
  socket.on('join', ({ id, role }) => {
    if (!id) return;
    socket.join(id);
    socket._trackId = id;
    socket._role = role;
    // announce join
    socket.to(id).emit('peer', { role, id });
  });

  // sender emits location updates
  socket.on('location', (loc) => {
    const id = socket._trackId;
    if (!id) return;
    // forward to everyone in the room except the sender
    socket.to(id).emit('location', loc);
  });

  socket.on('disconnect', () => {
    const id = socket._trackId;
    if (id) socket.to(id).emit('peer', { role: socket._role, disconnected: true });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
