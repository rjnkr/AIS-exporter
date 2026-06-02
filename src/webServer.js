'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

function startWebServer(port, fileManager, collector) {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Connection and collector status
  app.get('/api/status', (req, res) => {
    res.json({
      ...collector.getStatus(),
      ...fileManager.getStatus(),
    });
  });

  // List files, optionally filtered by ?start= and ?end= (ISO date strings or ms)
  app.get('/api/files', (req, res) => {
    try {
      const startTime = req.query.start ? new Date(req.query.start).getTime() : null;
      const endTime = req.query.end ? new Date(req.query.end).getTime() : null;

      if ((req.query.start && isNaN(startTime)) || (req.query.end && isNaN(endTime))) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      const files = fileManager.getFiles(startTime, endTime);
      res.json(files);
    } catch (err) {
      console.error('Error listing files:', err);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // Download one or more files
  // Single file: streamed directly
  // Multiple files: packaged as a .zip archive
  app.get('/api/download', (req, res) => {
    try {
      const rawFiles = req.query.files;
      if (!rawFiles) {
        return res.status(400).json({ error: 'No files specified' });
      }

      const fileList = (Array.isArray(rawFiles) ? rawFiles : [rawFiles])
        .map(f => f.trim())
        .filter(Boolean);

      if (fileList.length === 0) {
        return res.status(400).json({ error: 'No files specified' });
      }

      // Validate that all files exist before starting the response
      const resolvedFiles = fileList.map(filename => ({
        filename,
        filePath: fileManager.getFilePath(filename),
      }));

      const missing = resolvedFiles.filter(f => !fs.existsSync(f.filePath));
      if (missing.length > 0) {
        return res.status(404).json({ error: `Files not found: ${missing.map(f => f.filename).join(', ')}` });
      }

      if (resolvedFiles.length === 1) {
        const { filename, filePath } = resolvedFiles[0];
        return res.download(filePath, filename);
      }

      // Multiple files — send as zip
      const zipName = `AIS_export_${formatDateForFilename(new Date())}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', err => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      archive.pipe(res);
      for (const { filename, filePath } of resolvedFiles) {
        archive.file(filePath, { name: filename });
      }
      archive.finalize();
    } catch (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });

  app.listen(port, () => {
    console.log(`Web interface: http://localhost:${port}`);
  });
}

function formatDateForFilename(date) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

module.exports = { startWebServer };
