'use strict';

const stream = require('stream');

module.exports = Limited;

class Limited extends stream.Transform {
    constructor(length) {
        this._length = length;
        this._total = 0;
        return super({
            decodeStrings: false
        });
    }

    _transform(chunk, encoding, cb) {
        const total = this._total + chunk.length;
        if (total >= this._length) {
            this.emit('end', chunk.slice(total - this._length));
            return;
        }
        cb(null, chunk);
    }
}

