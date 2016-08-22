'use strict';

const stream = require('stream');

module.exports = Delimited;

class Delimited extends stream.Transform {
    constructor(delimiters) {
        this._delimiters = delimiters;
        this._rest = new Buffer();
        return super({
            decodeStrings: false
        });
    }

    _transform(chunk, encoding, cb) {
        const combined = Buffer.concat([this._rest, chunk]);
        const {delimiter, ix} = this._delimiters.reduce((prev, curr) => {
            if (combined.indexOf(curr.delimiter)) {
                prev.delimiter = curr.delimiter;
                prev.ix = curr.ix;
            }
            return prev;
        }, {delimiter: null, ix: -1});

        if (ix > -1) {
            const chunkIx = ix - this._rest.length;
            cb(null, chunk.slice(0, chunkIx));
            this.emit('end', chunk.slice(chunkIx), delimiter);
            this._rest = null;
            this._delimiters = null;
            return;
        }

        const startSliceIx = combined.length - delimiter.length - 1;
        if (startSliceIx > 0) {
            this._rest = combined.slice(startSliceIx, combined.length);
        } else {
            this._rest = combined;
        }
        cb(null, chunk);
    }
}
