'use strict';

const stream = require('stream');

class Limited extends stream.Transform {
    constructor(length) {
        const limited = super({
            decodeStrings: false
        });
        limited.length = length;
        limited.total = 0;
        return limited;
    }

    _transform(chunk, encoding, cb) {
        const total = this.total + chunk.length;
        let ix = chunk.length;
        if (total >= this.length) {
            ix -= total - this.total;
        }

        this.total += ix;
        cb(null, chunk.slice(0, ix));

        if (ix < chunk.length) {
            this.splice(chunk.slice(ix, chunk.length));
        }
        if (this.total === this.length) {
            this.emit('end');
        }
    }
}

module.exports = Limited;
