'use strict';

const debug = require('debug')('HttpHeadersReceiver');
const LimitedStream = require('./streams/limited.js');

module.exports = HttpHeadersReceiver;

class HttpHeadersReceiver extends LimitedStream {
    constructor(length) {
        debug('constructor');

        this._ended = false;
        this.buffer = new Buffer();
        this.remaining = new Buffer();

        this._captureAllData();

        return super(length);
    }

    _captureAllData() {
        this.on('data', data => {
            this.buffer = Buffer.concat(this.buffer, data);
        });
        this.on('end', remaining => {
            this._ended = true;
            this.remaining = remaining;
        });
    }

    waitUntilDone() {
        return new Promise(resolve => {
            if (this._ended) {
                return resolve();
            }
            this.on('end', resolve);
        });
    }
}

