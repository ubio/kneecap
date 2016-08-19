'use strict';

const Readable = require('stream').Readable;

class BodyStream extends Readable {
    constructor(...args) {
        return super(...args);
    }

    _read() {
    }

    *waitForReadStart() {
    }

    // *handleChunks(delimBuf) {
    //     const self = this;
    //     const len = parseInt(delimBuf.toString(), 16);
    //     let total = 0;
    //     if (!len) {
    //         throw new Error('Expected chunk length or terminator, ' +
    //             'got: ' + delimBuf.toString());
    //     }
    //     return function*(buffer) {
    //         if (buffer.length + total < len) {
    //             self.push(buffer);
    //             return buffer.length;
    //         }
    //     };
    // }
}

module.exports = BodyStream;
