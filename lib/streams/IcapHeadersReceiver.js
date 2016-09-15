'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');

// const stream = require('stream');
const Splicer = require('stream-splicer');
const debug = require('debug')('IcapHeadersReceiver');
const DelimitedStream = require('./Delimited.js');
const Bufferer = require('./Bufferer.js');

class IcapHeadersReceiver extends Splicer {
    constructor() {
        debug('constructor');

        const delimitedStream = new DelimitedStream(ICAP_HEADERS_DELIMITER);
        const bufferer = new Bufferer();
        const icapHeadersReceiver = super([delimitedStream, bufferer]);

        delimitedStream.on('end', () => {
            icapHeadersReceiver.buffer = bufferer.toBuffer();
            icapHeadersReceiver._ended = true;
            icapHeadersReceiver.emit('end');
        });

        icapHeadersReceiver._ended = false;
        return icapHeadersReceiver;
    }
}

module.exports = IcapHeadersReceiver;
