'use strict';

// const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');

const debug = require('debug')('BodyStream');
const DelimitedStream = require('./streams/delimited.js');

module.exports = BodyStream;

class BodyStream extends DelimitedStream {
    constructor() {
        debug('constructor');

        this.on('end', (remaining, delimiter) => {
            // remaining should be an empty buffer
            this.emit('done', delimiter);
        });

        return super(ICAP_HEADERS_DELIMITER);
    }
}

