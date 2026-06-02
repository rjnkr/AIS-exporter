'use strict';

const path = require('path');
const config = require('../config.json');
const { FileManager } = require('./fileManager');
const { AISCollector } = require('./collector');
const { startWebServer } = require('./webServer');

const projectRoot = path.join(__dirname, '..');
const rawDir = path.resolve(projectRoot, config.storage.rawDir);
const compressedDir = path.resolve(projectRoot, config.storage.compressedDir);

const fileManager = new FileManager(rawDir, compressedDir);
const collector = new AISCollector(config.tcp, fileManager);

fileManager.initialize();
collector.start();
startWebServer(config.web.port, fileManager, collector);

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  collector.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Terminating...');
  collector.stop();
  process.exit(0);
});
