'use strict';

// const ICAP_PREVIEW_EOF = Buffer.from('0; ieof\r\n\r\n');
// const ICAP_BODY_EOF = Buffer.from('0\r\n\r\n');
// const NEWLINE = Buffer.from('\r\n');

// const stream = require('stream');
const Splicer = require('stream-splicer');
const debug = require('debug')('Preview');

class Preview extends Splicer {
    constructor(region) {
        debug(`constructor ${region}`);
        const preview = super();
        return preview;
    }
}

module.exports = Preview;
