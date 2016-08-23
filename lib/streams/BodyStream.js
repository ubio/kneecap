'use strict';

const ICAP_PREVIEW_EOF = Buffer.from('0; ieof\r\n\r\n');
const ICAP_BODY_EOF = Buffer.from('0\r\n\r\n');
const NEWLINE = Buffer.from('\r\n');

const stream = require('stream');

const debug = require('debug')('BodyStream');
// const DelimitedStream = require('./streams/delimited.js');

module.exports = BodyStream;

class BodyStream extends stream.Transform {
    constructor() {
        debug('constructor');
        this._nextChunkIx = 0;
        this._unconsumed = new Buffer(0);
        return super();
    }

    _transform(chunk, encoding, cb) {
        if (this._unconsumed.length === 0) {
            if (chunk.length < this._nextChunkIx) {
                this._nextChunkIx -= chunk.length;
                return cb(null, chunk);
            }
            cb(null, chunk.slice(0, this._nextChunkIx));
            return this._handleUnknownData(chunk.slice(this._nextChunkIx));
        }
        this._handleUnknownData(chunk);
        cb();
    }

    _handleUnknownData(chunk) {
        this._unconsumed = Buffer.concat([this._unconsumed, chunk]);
        const chunkDetails = getContentDetails(this._unconsumed);
        if (chunkDetails) {
            if (chunkDetails.type === 'chunk') {
                this._nextChunkIx = chunkDetails.length;
                const toConsume = this._unconsumed.slice(chunkDetails.ix);
                this._unconsumed = new Buffer(0);
                this.consume(toConsume);
            } else if (chunkDetails.type === 'EOF') {
                this._end(chunkDetails.terminator);
            }
        }
    }

    consume(buffer) {
        this._transform(buffer, null, (err, toWrite) => {
            this._write(toWrite);
            if (toWrite.length !== buffer.length) {
                this._handleUnknownData(buffer.slice(toWrite.length));
            }
        });
    }

    _end(terminator) {
        let continueMightBeAllowed = false;
        if (terminator === ICAP_PREVIEW_EOF) {
            // Redundant, kept for brevity. This is a know fact, the protocol
            // specifies that servers MUST NOT send 100 continue when the
            // preview EOF terminator is received
            continueMightBeAllowed = false;
        }
        if (terminator === ICAP_BODY_EOF) {
            // Body allows continue, but icapSession must also check that
            // we are in preview mode (confirm icap header Preview)
            continueMightBeAllowed = true;
        }
        this.emit('end', continueMightBeAllowed);
    }
}

function getContentDetails(buffer) {
    // There is an extra \r\n in the beginning here, because body
    // chunks end with a new line
    // if (buffer.indexOf(NEWLINE) === 0) {
        buffer = buffer.slice(NEWLINE.length);
    // }
    if (buffer.indexOf(ICAP_PREVIEW_EOF) === 0) {
        return {
            type: 'EOF',
            terminator: ICAP_PREVIEW_EOF
        };
    } else if (buffer.indexOf(ICAP_BODY_EOF) === 0) {
        return {
            type: 'EOF',
            terminator: ICAP_BODY_EOF
        };
    }

    const ix = buffer.indexOf(NEWLINE);
    if (ix > -1) {
        const length = parseInt(buffer.slice(0, ix).toString(), 16);
        if (!length) {
            throw new Error('Expected chunk length or terminator, ' +
                'got: ' + buffer.toString());
        }
        return {
            type: 'chunk',
            startIx: ix,
            length
        };
    }
}

