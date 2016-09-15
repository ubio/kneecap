'use strict';

const stream = require('stream');

class Delimited extends stream.Transform {
    constructor(delimiter) {
        const delimited = super({
            decodeStrings: false
        });
        delimited.delimiter = delimiter;
        return delimited;
    }

    _transform(chunk, encoding, cb) {
        let ix = -1, done = false;
        if (chunk.length >= this.delimiter) {
            ix = chunk.indexOf(this.delimiter);
        }
        if (ix > -1) {
            ix += this.delimiter.length;
            done = true;
        } else {
            ix = findLastPossibleIx(chunk, this.delimiter);
        }

        if (ix > 0) {
            cb(null, chunk.slice(0, ix));
        } else {
            cb();
        }
        this.emit('parent-unshift', chunk.slice(ix));

        if (done) {
            this.push(null);
        }
    }
}

module.exports = Delimited;

function findLastPossibleIx(chunk, delimiter) {
    let ix = Math.max(chunk.length - delimiter.length, 0);
    while (ix < chunk.length - 1) {
        const candidate = chunk.slice(ix);
        if (candidate.equals(delimiter.slice(0, candidate.length))) {
            return ix;
        }
        ++ix;
    }
    return -1;
}
