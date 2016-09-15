'use strict';

const debug = require('debug')('HttpHeaders');
const Limited = require('./Limited.js');

class HttpHeaders extends Limited {
    constructor(region, length) {
        debug('constructor');

        const limitedStream = super(length);
        limitedStream.region = region;

        return limitedStream;
    }
}

module.exports = HttpHeaders;
