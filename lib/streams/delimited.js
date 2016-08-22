'use strict';

const stream = require('stream');

module.exports = Delimited;

class Delimited extends stream.Transform {
    constructor(delimiter) {
        this._delimiter = delimiter;
        this._rest = new Buffer();
        return super({
            decodeStrings: false
        });
    }

    _transform(chunk, encoding, cb) {
        const combined = Buffer.concat([this._rest, chunk]);
        const ix = combined.indexOf(this._delimiter);
        if (ix > -1) {
            const chunkIx = ix - this._rest.length;
            cb(null, chunk.slice(0, chunkIx));
            this.emit('end', chunk.slice(chunkIx));
            this._rest = null;
            this._delimiter = null;
            return;
        }

        const startSliceIx = combined.length - this._delimiter.length - 1;
        if (startSliceIx > 0) {
            this._rest = combined.slice(startSliceIx, combined.length);
        } else {
            this._rest = combined;
        }
        cb(null, chunk);
    }
}
