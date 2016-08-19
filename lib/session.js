'use strict';

// const ICAP_PREVIEW_EOF = Buffer.from('0; ieof');
// const ICAP_BODY_EOF = Buffer.from('0');

const stream = require('stream');
const debug = require('debug')('Session');

const IcapHeadersReceiver = require('./IcapHeadersReceiver.js');
const LimitedStream = require('./streams/limited.js');

module.exports = Session;

class Session extends stream.Transform {
    constructor() {
        debug('constructor');
        this._externalPipes = [];

        this._reset();
        return super({
            decodeStrings: false
        });
    }

    _reset() {
        const icapHeadersReceiver = new IcapHeadersReceiver();
        this._pipe(icapHeadersReceiver);
        icapHeadersReceiver.on('done', remaining => {
            this.unpipe(icapHeadersReceiver);
            const decoded = icapHeadersReceiver.decoded;
            createRegionStreams(decoded);
            this.emit('request', decoded);

            this._handlePayload(decoded, remaining);
        });
    }

    pipe(dest) {
        if (this._pipable) {
            return super.pipe(dest);
        }
        this._externalPipes.push(dest);
    }

    _pipe(dest) {
        this._pipable = false;
        return super.pipe(dest);
    }

    _transform(chunk, encoding, cb) {
        cb(null, chunk);
    }

    _handlePayload(decoded, remaining) {
        if (Object.keys(decoded.streams).length > 0) {
            decoded.streams
        }
    }
}

function createRegionStreams(decoded) {
    let ix = 0, region;
    while (region = decoded.icapDetails.encapsulatedRegions[ix]) {
        const nextRegion = decoded.icapDetails.encapsulatedRegions[ix + 1];
        if (nextRegion) {
            // Only headers can be received before the single *-body
            decoded.streams.push([region.name, new LimitedStream(nextRegion.startOffset - region.startOffset)]);
        } else if (region.name !== 'null-body') {
        }
        ++ix;
    }
}
