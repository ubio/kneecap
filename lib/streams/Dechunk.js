'use strict';

const EMPTY_BUFFER = new Buffer(0);

const stream = require('stream');

class Dechunk extends stream.Transform {
    constructor(newline = Buffer.from('\r\n')) {
        const dechunk = super();
        dechunk.newline = newline;
        dechunk.sofar = 0;
        dechunk.expected = 0;
        dechunk.unconsumed = EMPTY_BUFFER;
        return dechunk;
    }

    _transform(buffer, encoding, cb) {
        const unconsumed = this.unconsumed;
        this.unconsumed = EMPTY_BUFFER;
        const {err, pieces} = performDechunking(this, Buffer.concat([unconsumed, buffer]));
        const result = Buffer.concat(pieces);
        if (result.length > 0) {
            cb(err, result);
            return;
        }
        cb(err);
    }
}

module.exports = Dechunk;

// Instance methods

function performDechunking(dechunk, buffer) {
    let pieces = [], err = null;
    const ix = dechunk.expected - dechunk.sofar;
    if (buffer.length < ix) {
        pieces.push(buffer);
        dechunk.sofar += buffer.length;
        // if (dechunk.sofar === dechunk.expected) { // same as ix === buffer.length
        //     dechunk.expectedDataType = TYPE_SEPARATOR;
        //     dechunk.expected = dechunk.newline.length;
        //     dechunk.sofar = 0;
        // }
    } else if (buffer.length >= ix && buffer.length < ix + dechunk.newline.length) {
        pieces.push(buffer.slice(0, ix - 1));
        dechunk.sofar += ix - 1;
        dechunk.unconsumed = buffer.slice(ix - 1);
    } else {
        const hasData = ix > 0;
        if (hasData) {
            pieces.push(buffer.slice(0, ix));
        }
        dechunk.sofar = 0;
        const result = prepareNextChunk(dechunk, buffer.slice(ix + (hasData ? dechunk.newline.length : 0)));
        if (result) {
            if (result.err) {
                err = result.err;
            } else if (result.nextBuffer) {
                const dechunkResult = performDechunking(dechunk, result.nextBuffer);
                if (dechunkResult.err) {
                    err = dechunkResult.err;
                } else {
                    pieces = pieces.concat(dechunkResult.pieces);
                }
            }
        }
    }

    return {err, pieces};
}

function prepareNextChunk(dechunk, buffer) {
    const newlineIx = buffer.indexOf(dechunk.newline);
    if (newlineIx < 0) {
        dechunk.expected = 0;
        dechunk.unconsumed = buffer;
        return;
    }
    const chunkLengthPart = buffer.slice(0, newlineIx).toString();
    const expected = getIntFromHex(chunkLengthPart);
    if (Number.isNaN(expected)) {
        dechunk.unconsumed = buffer;
        const err = new Error('Unexpected chunk length');
        err.details = {
            chunkLengthPart
        };
        return {err};
    }
    dechunk.expected = expected;
    const ix = newlineIx + dechunk.newline.length;
    const nextBuffer = buffer.slice(ix);
    return {err: null, nextBuffer};
}

// Helpers

function getIntFromHex(value) {
    if (/^[0-9a-fA-F]+$/.test(value)) {
        return parseInt(value, 16);
    }
    return Number.NaN;
}
