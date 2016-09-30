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
        const pieces = performDechunking(this, Buffer.concat([unconsumed, buffer]));
        const result = Buffer.concat(pieces);
        if (result.length > 0) {
            cb(null, result);
            return;
        }
        cb();
    }
}

module.exports = Dechunk;

function performDechunking(dechunk, buffer) {
    let pieces = [];
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
        const nextBuffer = prepareNextChunk(dechunk, buffer.slice(ix + (hasData ? dechunk.newline.length : 0)));
        if (nextBuffer) {
            const otherPieces = performDechunking(dechunk, nextBuffer);
            pieces = pieces.concat(otherPieces);
        }
    }

    return pieces;
}

function prepareNextChunk(dechunk, buffer) {
    const newlineIx = buffer.indexOf(dechunk.newline);
    if (newlineIx < 0) {
        dechunk.expected = 0;
        dechunk.unconsumed = buffer;
        return;
    }
    dechunk.expected = parseInt(buffer.slice(0, newlineIx).toString(), 16);
    const ix = newlineIx + dechunk.newline.length;
    return buffer.slice(ix);
}
