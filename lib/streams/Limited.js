'use strict';

const stream = require('stream');

class Limited extends stream.Transform {
    constructor(length) {
        const limited = super({
            decodeStrings: false
        });
        limited.length = length;
        limited.sofar = 0;
        return limited;
    }

    _transform(chunk, encoding, cb) {
        const total = this.sofar + chunk.length;
        let ix = chunk.length;
        if (total > this.length) {
            ix -= total - this.sofar;
        }

        this.sofar += ix;
        cb(null, chunk.slice(0, ix));

        if (ix < chunk.length) {
            this.emit('parent-unshift', chunk.slice(ix, chunk.length));
        }
        if (this.sofar === this.length) {
            this.push(null);
        }
    }
}

module.exports = Limited;
