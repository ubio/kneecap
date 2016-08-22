'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');

const debug = require('debug')('IcapHeadersReceiver');
const DelimitedStream = require('./streams/delimited.js');

module.exports = IcapHeadersReceiver;

class IcapHeadersReceiver extends DelimitedStream {
    constructor() {
        debug('constructor');

        this._ended = false;
        this.buffer = new Buffer();
        this.remaining = new Buffer();

        this._captureAllData();

        return super(ICAP_HEADERS_DELIMITER);
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
