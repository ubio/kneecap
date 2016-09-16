'use strict';

const stream = require('stream');

class Dechunk extends stream.Transform {
    constructor(newline = Buffer.from('\r\n')) {
        const dechunk = super();
        dechunk.newline = newline;
        dechunk.sofar = 0;
        dechunk.expected = 0;
        return dechunk;
    }

    _transform(buffer, encoding, cb) {
        const pieces = performDechunking(this, buffer);
        cb(null, Buffer.concat(pieces));
    }
}

module.exports = Dechunk;

function performDechunking(dechunk, buffer) {
    let pieces = [];
    const ix = dechunk.expected - dechunk.sofar;
    if (buffer.length <= ix) {
        pieces.push(buffer);
        dechunk.sofar += buffer.length;
    } else {
        pieces.push(buffer.slice(0, ix));
        dechunk.sofar = 0;
        const nextBuffer = nextChunk(dechunk, buffer.slice(ix));
        if (nextBuffer) {
            const otherPieces = performDechunking(dechunk, nextBuffer);
            pieces = pieces.concat(otherPieces);
        }
    }

    return pieces;
}

function nextChunk(dechunk, buffer) {
    const newlineIx = buffer.indexOf(dechunk.newline);
    if (newlineIx < 0) {
        dechunk.expected = 0;
        dechunk.unshift(buffer);
        return;
    }
    dechunk.expected = parseInt(buffer.slice(0, newlineIx).toString());
    const ix = newlineIx + dechunk.newline.length;
    return buffer.slice(ix);
}
