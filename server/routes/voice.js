// ============================================================
// server/routes/voice.js  —  Voice Message Upload Route
// POST /api/voice/upload  → stores in GridFS, returns URL
// ============================================================

const express    = require('express');
const multer     = require('multer');
const { GridFSBucket } = require('mongodb');
const mongoose   = require('mongoose');
const router     = express.Router();

// ── Multer: store in memory, max 10 MB ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  }
});

// ── POST /api/voice/upload ───────────────────────────────────
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const db     = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'voiceMessages' });

    const filename = `voice_${Date.now()}_${req.body.username || 'user'}.webm`;

    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        username:  req.body.username,
        room:      req.body.room,
        duration:  req.body.duration || 0,
        uploadedAt: new Date()
      },
      contentType: req.file.mimetype
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', () => {
      const baseUrl = process.env.SERVER_BASE_URL || `${req.protocol}://${req.get('host')}`;
      res.json({
        success:  true,
        fileId:   uploadStream.id,
        url:      `${baseUrl}/api/voice/stream/${uploadStream.id}`,
        filename,
        duration: req.body.duration || 0
      });
    });

    uploadStream.on('error', (err) => {
      console.error('[voice upload]', err);
      res.status(500).json({ error: 'Upload failed' });
    });

  } catch (err) {
    console.error('[voice upload]', err);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

// ── GET /api/voice/stream/:fileId ────────────────────────────
router.get('/stream/:fileId', async (req, res) => {
  try {
    const db     = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'voiceMessages' });
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).json({ error: 'Audio not found' });

    res.set('Content-Type', files[0].contentType || 'audio/webm');
    res.set('Accept-Ranges', 'bytes');

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.pipe(res);

    downloadStream.on('error', () => res.status(404).end());

  } catch (err) {
    console.error('[voice stream]', err);
    res.status(500).json({ error: 'Stream error' });
  }
});

module.exports = router;