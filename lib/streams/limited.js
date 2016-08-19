'use strict';

const stream = require('stream');

module.exports = Limited;

class Limited extends stream.Transform {
    constructor(length) {
        this._length = length;
        this._rest = new Buffer();
        return super({
            decodeStrings: false
        });
    }

    _transform(chunk, encoding, cb) {
        // const ix = Buffer.concat([this._rest, chunk]).indexOf(this._length);
        // if (ix > -1) {
        //     const chunkIx = ix - this._rest.length;
        //     cb(null, chunk.slice(0, chunkIx));
        //     this.emit('end', chunk.slice(chunkIx));
        //     return;
        // }
        cb(null, chunk);
    }
}

