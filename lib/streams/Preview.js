'use strict';

const ICAP_PREVIEW_EOF = Buffer.from('0; ieof\r\n\r\n');
const ICAP_BODY_EOF = Buffer.from('0\r\n\r\n');
const NEWLINE = Buffer.from('\r\n');

// const stream = require('stream');
const Splicer = require('stream-splicer');
const debug = require('debug')('Preview');
const DelimitedStream = require('./Delimited.js');
const DechunkStream = require('./Dechunk.js');

class Preview extends Splicer {
    constructor(region) {
        debug(`constructor ${region}`);
        const delimitedStream = new DelimitedStream([
            ICAP_PREVIEW_EOF,
            ICAP_BODY_EOF
        ]);
        const dechunkStream = new DechunkStream(NEWLINE);
        const preview = super([delimitedStream, dechunkStream]);

        delimitedStream.on('end', onEnd);
        delimitedStream.on('parent-unshift', onParentUnshift);
        return preview;

        function onParentUnshift(chunk) {
            delimitedStream.once('end', () => {
                preview.emit('parent-unshift', chunk);
            });
        }

        function onEnd() {
            cleanup();
            preview.emit('end');
        }

        function cleanup() {
            delimitedStream.removeListener('end', onEnd);
            delimitedStream.removeListener('parent-unshift', onParentUnshift);
        }
    }
}

module.exports = Preview;
