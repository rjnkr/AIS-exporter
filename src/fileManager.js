'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cron = require('node-cron');

class FileManager {
  constructor(rawDir, compressedDir) {
    this.rawDir = rawDir;
    this.compressedDir = compressedDir;
    this.currentFile = null;
    this.currentStream = null;
    this.currentHour = null;
  }

  initialize() {
    [this.rawDir, this.compressedDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    this.openCurrentFile();

    // Rotate at the top of every hour
    cron.schedule('0 * * * *', () => {
      console.log('Hourly rotation triggered by scheduler');
      this.rotate();
    });
  }

  getCurrentHourDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  }

  formatTimestamp(date) {
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}0000`;
  }

  openCurrentFile() {
    const hourDate = this.getCurrentHourDate();
    const ts = this.formatTimestamp(hourDate);
    const filename = `AIS_${ts}.nmea`;
    const filePath = path.join(this.rawDir, filename);

    this.currentHour = hourDate.getTime();
    this.currentFile = filename;
    this.currentStream = fs.createWriteStream(filePath, { flags: 'a' });

    this.currentStream.on('error', err => {
      console.error(`Write stream error: ${err.message}`);
    });

    console.log(`Writing to: ${filename}`);
  }

  writeLine(line) {
    const now = Date.now();
    const currentHourTs = this.getCurrentHourDate().getTime();

    if (currentHourTs !== this.currentHour) {
      this.rotate();
    }

    if (this.currentStream && !this.currentStream.destroyed) {
      this.currentStream.write(`${now},${line}\n`);
    }
  }

  rotate() {
    const oldFilename = this.currentFile;
    const oldStream = this.currentStream;

    // Open the new file first so data keeps flowing
    this.openCurrentFile();

    if (oldStream && !oldStream.destroyed) {
      oldStream.end(() => {
        if (oldFilename) {
          this.compressFile(oldFilename);
        }
      });
    }
  }

  compressFile(filename) {
    const srcPath = path.join(this.rawDir, filename);
    const destPath = path.join(this.compressedDir, `${filename}.gz`);

    if (!fs.existsSync(srcPath)) return;

    const readStream = fs.createReadStream(srcPath);
    const writeStream = fs.createWriteStream(destPath);
    const gzip = zlib.createGzip({ level: 6 });

    pipeline(readStream, gzip, writeStream, (err) => {
      if (err) {
        console.error(`Compression failed for ${filename}: ${err.message}`);
        return;
      }
      fs.unlink(srcPath, unlinkErr => {
        if (unlinkErr) console.error(`Failed to delete ${srcPath}: ${unlinkErr.message}`);
        else console.log(`Compressed: ${filename}.gz`);
      });
    });
  }

  getFiles(startTime, endTime) {
    const files = [];

    if (fs.existsSync(this.rawDir)) {
      for (const filename of fs.readdirSync(this.rawDir)) {
        if (!filename.startsWith('AIS_') || !filename.endsWith('.nmea')) continue;
        const fileTime = this.parseFileTimestamp(filename);
        if (!fileTime || !this.isInRange(fileTime, startTime, endTime)) continue;
        const stats = fs.statSync(path.join(this.rawDir, filename));
        files.push({
          name: filename,
          type: 'raw',
          size: stats.size,
          timestamp: fileTime,
          isCurrent: filename === this.currentFile,
        });
      }
    }

    if (fs.existsSync(this.compressedDir)) {
      for (const filename of fs.readdirSync(this.compressedDir)) {
        if (!filename.startsWith('AIS_') || !filename.endsWith('.nmea.gz')) continue;
        const baseName = filename.slice(0, -3); // strip .gz
        const fileTime = this.parseFileTimestamp(baseName);
        if (!fileTime || !this.isInRange(fileTime, startTime, endTime)) continue;
        const stats = fs.statSync(path.join(this.compressedDir, filename));
        files.push({
          name: filename,
          type: 'compressed',
          size: stats.size,
          timestamp: fileTime,
          isCurrent: false,
        });
      }
    }

    files.sort((a, b) => a.timestamp - b.timestamp);
    return files;
  }

  parseFileTimestamp(filename) {
    const match = filename.match(/AIS_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    if (!match) return null;
    const [, year, month, day, hour, min, sec] = match;
    return new Date(+year, +month - 1, +day, +hour, +min, +sec).getTime();
  }

  isInRange(fileTime, startTime, endTime) {
    // A file starting at fileTime covers one full hour, so endTime of that hour is fileTime + 3600000
    const fileEndTime = fileTime + 3599999;
    if (startTime && fileEndTime < startTime) return false;
    if (endTime && fileTime > endTime) return false;
    return true;
  }

  getFilePath(filename) {
    if (filename.endsWith('.gz')) {
      return path.join(this.compressedDir, filename);
    }
    return path.join(this.rawDir, filename);
  }

  getStatus() {
    return {
      currentFile: this.currentFile,
    };
  }
}

// Node 10+ stream pipeline helper
function pipeline(src, transform, dest, cb) {
  src.on('error', cb);
  transform.on('error', cb);
  dest.on('error', cb);
  dest.on('finish', () => cb(null));
  src.pipe(transform).pipe(dest);
}

module.exports = { FileManager };
