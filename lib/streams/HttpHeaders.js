'use strict';

const Limited = require('./Limited.js');

class HttpHeaders extends Limited {
    constructor(region, length) {
        const httpHeaders = super(length);
        httpHeaders.region = region;
        return httpHeaders;
    }
}

module.exports = HttpHeaders;
