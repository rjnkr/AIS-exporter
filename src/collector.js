  'use strict';

const net = require('net');
const crypto = require('crypto');

const RECONNECT_DELAY_INITIAL = 5000;
const RECONNECT_DELAY_MAX = 60000;

class AISCollector {
  constructor(config, fileManager) {
    this.host = config.host;
    this.port = config.port;
    this.username = config.username;
    this.password = config.password;
    this.loginType = config.loginType === 'hashed' ? 'hashed' : 'plain';
    this.fileManager = fileManager;
    this.socket = null;
    this.buffer = '';
    this.reconnectDelay = RECONNECT_DELAY_INITIAL;
    this.reconnectTimer = null;
    this.running = false;
    this.connected = false;
    this.linesReceived = 0;
  }

  buildLoginPacket() {
    const user = Buffer.from(this.username, 'ascii');
    const nullByte = Buffer.from([0x00]);

    if (this.loginType === 'hashed') {
      // Command Id=2, Account Name, NUL, Base64(MD5(password)), NUL
      const md5 = crypto.createHash('md5').update(this.password).digest();
      const hashedPw = Buffer.from(md5.toString('base64'), 'ascii');
      return Buffer.concat([Buffer.from([0x02]), user, nullByte, hashedPw, nullByte]);
    }

    // Command Id=1, Account Name, NUL, Password
    const pw = Buffer.from(this.password, 'ascii');
    return Buffer.concat([Buffer.from([0x01]), user, nullByte, pw]);
  }

  start() {
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  connect() {
    if (!this.running) return;
    console.log(`Connecting to ${this.host}:${this.port}...`);

    const socket = new net.Socket();
    this.socket = socket;
    this.buffer = '';

    socket.connect(this.port, this.host, () => {
      this.connected = true;
      this.reconnectDelay = RECONNECT_DELAY_INITIAL;
      console.log(`Connected to ${this.host}:${this.port}`);

      const loginPacket = this.buildLoginPacket();
      socket.write(loginPacket);
      console.log(`Login sent (type: ${this.loginType})`);
    });

    socket.on('data', (data) => {
      this.buffer += data.toString('ascii');
      this.processBuffer();
    });

    socket.on('close', () => {
      this.connected = false;
      console.log('Connection closed');
      this.scheduleReconnect();
    });

    socket.on('error', (err) => {
      this.connected = false;
      console.error(`Socket error: ${err.message}`);
      // 'close' event fires after 'error', reconnect handled there
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\r\n');
    // Last element is either empty (complete) or an incomplete fragment
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        this.linesReceived++;
        this.fileManager.writeLine(trimmed);
      }
    }
  }

  scheduleReconnect() {
    if (!this.running) return;
    console.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_DELAY_MAX);
      this.connect();
    }, this.reconnectDelay);
  }

  getStatus() {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port,
      linesReceived: this.linesReceived,
    };
  }
}

module.exports = { AISCollector };
