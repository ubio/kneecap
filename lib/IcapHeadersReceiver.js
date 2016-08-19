'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');

const debug = require('debug')('IcapHeadersReceiver');
const parser = require('./parser.js');
const DelimitedStream = require('./streams/delimited.js');

module.exports = IcapHeadersReceiver;

class IcapHeadersReceiver extends DelimitedStream {
    constructor() {
        debug('constructor');

        this.decoded = null;
        this._buffer = new Buffer();

        this.on('data', data => {
            this._buffer = Buffer.concat(this._buffer, data);
        });
        this.on('end', remaining => {
            this.decoded = createDecodedObject(parser.parseIcapDetails(this._buffer));
            this.emit('done', remaining);
        });

        return super(ICAP_HEADERS_DELIMITER);
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
