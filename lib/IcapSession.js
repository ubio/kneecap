'use strict';

const stream = require('stream');
const debug = require('debug')('IcapSession');

const parser = require('./parser.js');
const HttpHeadersReceiver = require('./HttpHeadersReceiver.js');
const BodyStream = require('./streams/BodyStream.js');

class IcapSession extends stream.Duplex {
    constructor(buffer, remaining) {
        debug('constructor');
        this.icapDetails = parser.parseIcapDetails(buffer);
        this.previewMode = this.icapDetails.headers.has('preview');
        this.allowContinue = false;
        this.streams = getRegionStreams(this);
        startStreams(this, remaining);
    }

    async waitUntilDone() {
        return new Promise(resolve => {
            // TODO: wait until writing response is done, then return
            resolve;
        });
    }

    pipe(dest) {
        this.externalPipe = dest;
    }

    unpipe(dest) {
        if (dest) {
            this._unpipe(dest);
            if (dest === this.externalPipe) {
                this.externalPipe = null;
            }
        } else {
            this._unpipe(this.externalPipe);
        }
    }

    _unpipe(dest) {
        return super.unpipe(dest);
    }

    _pipe(dest) {
        return super.pipe(dest);
    }

    dontChange() {
    }
}

module.exports = IcapSession;

// Private 'instance' methods
function getRegionStreams(icapSession) {
    const streams = [];

    let ix = 0, region;
    while (region = icapSession.icapDetails.encapsulatedRegions[ix]) {
        const nextRegion = icapSession.icapDetails.encapsulatedRegions[ix + 1];
        if (nextRegion) {
            // Only headers can be received before the single *-body
            streams.push([
                region.name,
                new HttpHeadersReceiver(nextRegion.startOffset - region.startOffset)
            ]);
        } else if (region.name !== 'null-body') {
        } else {
            // *-body with data
            streams.push([
                region.name,
                new BodyStream(),
                handleBodyStreamEnd
            ]);
        }
        ++ix;
    }

    return streams;
}

async function startStreams(icapSession, remaining) {
    const streams = icapSession.streams;
    for (let i = 0; i < streams.length; ++i) {
        const regionName = streams[i][0];
        const stream = streams[i][1];
        debug(`waiting to receive ${regionName}`);
        // remaining is a buffer for header streams, but a boolean for the body stream
        remaining = await waitForStream(icapSession, stream, remaining);
        debug(`done receiving ${regionName}`);

        const fn = streams[i][2];
        if (typeof fn === 'function') {
            fn(icapSession, remaining);
        }
    }

    this.emit('receive-end-1');
}

function waitForStream(icapSession, stream, remaining) {
    return new Promise(resolve => {
        stream.once('end', streamEnded);
        if (Buffer.isBuffer(remaining) && remaining.length > 0) {
            stream.consume(remaining);
        }
        icapSession._pipe(stream);

        function streamEnded(arg) {
            icapSession.unpipe(stream);
            resolve(arg);
        }
    });
}

function handleBodyStreamEnd(icapSession, continueMightBeAllowed) {
    if (continueMightBeAllowed) {
        icapSession.allowContinue = icapSession.previewMode;
    }
}
