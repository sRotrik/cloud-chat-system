const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

// Store files in MongoDB using GridFS
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|mp3|wav|ogg|webm|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error('Only images, audio, and video files are allowed'));
  }
});

// File schema
const FileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimetype: String,
  size: Number,
  data: Buffer,
  uploadedBy: String,
  room: String,
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }
});
FileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const File = mongoose.model('File', FileSchema);

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = crypto.randomBytes(16).toString('hex') + 
      path.extname(req.file.originalname);

    const file = new File({
      filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
      uploadedBy: req.body.username || 'anonymous',
      room: req.body.room || 'general',
    });

    await file.save();

    res.json({
      fileId: file._id,
      filename: file.filename,
      originalName: file.originalName,
      mimetype: file.mimetype,
      size: file.size,
      url: `/media/file/${file._id}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get file by ID
router.get('/file/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    res.set('Content-Type', file.mimetype);
    res.set('Content-Disposition', `inline; filename="${file.originalName}"`);
    res.send(file.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;