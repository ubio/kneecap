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

        delimitedStream.on('end', onEnd);

        delimitedStream.on('parent-unshift', onParentUnshift);

        return icapHeadersReceiver;

        function onParentUnshift(chunk) {
            delimitedStream.once('end', () => {
                icapHeadersReceiver.emit('parent-unshift', chunk);
            });
        }

        function onEnd() {
            cleanup();
            icapHeadersReceiver.buffer = bufferer.toBuffer();
            icapHeadersReceiver.emit('end');
        }

        function cleanup() {
            delimitedStream.removeListener('end', onEnd);
            delimitedStream.removeListener('parent-unshift', onParentUnshift);
        }
    }
}

module.exports = IcapHeadersReceiver;
