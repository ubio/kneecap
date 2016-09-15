'use strict';

const stream = require('stream');
const Buffers = require('buffers');

class Bufferer extends stream.Writable {
    constructor(...args) {
        return super(...args);
    }

    _write(chunk, encoding, cb) {
        if (!this.buffers) {
            this.buffers = new Buffers([chunk]);
        } else {
            this.buffers.push(chunk);
        }
        cb();
    }

    toBuffer() {
        return this.buffers.toBuffer();
    }
}

module.exports = Bufferer;
