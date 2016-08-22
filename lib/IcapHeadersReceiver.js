'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');

const debug = require('debug')('IcapHeadersReceiver');
const parser = require('./parser.js');
const DelimitedStream = require('./streams/delimited.js');

module.exports = IcapHeadersReceiver;

class IcapHeadersReceiver extends DelimitedStream {
    constructor() {
        debug('constructor');

        this._ended = false;
        this._buffer = new Buffer();
        this.decoded = null;
        this.remaining = new Buffer();

        this._captureAllData();

        return super(ICAP_HEADERS_DELIMITER);
    }

    _captureAllData() {
        this.on('data', data => {
            this._buffer = Buffer.concat(this._buffer, data);
        });
        this.on('end', remaining => {
            this._ended = true;
            this.decoded = createDecodedObject(parser.parseIcapDetails(this._buffer));
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

function createDecodedObject(icapDetails) {
    return {
        icapDetails,
        previewMode: icapDetails.headers.has('preview'),
        streams: [], // order matters
        // allowContinue: false
    };
}
