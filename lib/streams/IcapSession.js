'use strict';

const Splicer = require('stream-splicer');
const stream = require('stream');
const debug = require('debug')('IcapSession');
const EndlessPassThrough = require('./EndlessPassThrough.js');
const HttpHeadersStream = require('./HttpHeaders.js');
const BodyStream = require('./Body.js');
const PreviewStream = require('./Preview.js');

class IcapSession extends Splicer {
    constructor(details) {
        debug('constructor');
        const reader = new stream.PassThrough();
        const stopper = new stream.Transform({
            transform: (b, e, cb) => cb()
        });
        const writer = new EndlessPassThrough();
        const icapSession = super([reader, stopper, writer]);
        icapSession.reader = reader;
        icapSession.stopper = stopper;
        icapSession.writer = writer;

        icapSession.details = details; // instance of IcapDetails
        icapSession.remainingBodyStream = null;

        icapSession.streams = getRegionStreams(icapSession.details);
        cycleReaderStreams(icapSession);

        return icapSession;
    }

    async send(stream) {
        stream.pipe(this.writer);
        await waitForEnd(stream);
        stream.unpipe(this.writer);
        this.emit('end');
    }

    getRegionStream(region) {
        // TODO: return -hdr streams, build body stream from preview + remaining if necessary
        return this.streams.find(stream => stream.region === region);
    }

    getRemainingBodyStream() {
    }
}

module.exports = IcapSession;

// Private instance methods

function sendContinue(icapSession) {
    const encapsulatedRegions = icapSession.icapDetails.encapsulatedRegions;
    icapSession.remainingBodyStream = new BodyStream(encapsulatedRegions[encapsulatedRegions.length - 1].name);
    // TODO: write 100 Continue
}

async function cycleReaderStreams(icapSession) {
    const unshifts = [], reader = icapSession.reader, streams = icapSession.streams;
    for (let i = 0; i < streams.length; ++i) {
        // TODO: check we haven't ended.
        //
        // When there is a preview, user may choose to respond without
        // reading the body.
        // Actually, the user may choose to respond without reading any
        // of the streams.
        const stream = streams[i];
        prepare(stream);
        while (unshifts.length) {
            reader.unshift(unshifts.shift());
        }
        debug(`waiting for ${stream.region} stream`);
        await waitForEnd(stream);
        debug(`done with ${stream.region} stream`);
        cleanup(stream);
    }

    function prepare(stream) {
        stream.on('parent-unshift', onParentUnshift);
        reader.pipe(stream);
    }

    function cleanup(stream) {
        reader.unpipe(stream);
        reader.removeListener('parent-unshift', onParentUnshift);
    }

    function onParentUnshift(chunk) {
        unshifts.push(chunk);
    }

    if (icapSession.remainingBodyStream) {
        prepare(icapSession.remainingBodyStream);
        debug('waiting for remaining body stream');
        await waitForEnd(icapSession.remainingBodyStream);
        debug('done with remaining body stream');
        cleanup(icapSession.remainingBodyStream);
    }
}

// Helpers

async function waitForEnd(stream) {
    return new Promise(resolve => {
        if (stream._readableState.ended) { // TODO: don't use private props
            return resolve();
        }
        stream.once('end', resolve);
    });
}

function getRegionStreams(icapDetails) {
    const streams = [];

    let ix = 0, region;
    while (region = icapDetails.encapsulatedRegions[ix]) {
        const nextRegion = icapDetails.encapsulatedRegions[ix + 1];
        if (nextRegion) {
            // Only headers can be received before the single *-body
            streams.push(new HttpHeadersStream(region.name, nextRegion.startOffset - region.startOffset));
        } else if (region.name !== 'null-body') {
            // *-body with data
            if (icapDetails.hasPreview()) {
                streams.push(new PreviewStream(region.name));
            }
            streams.push(new BodyStream(region.name));
        } else {
            // null-body
        }
        ++ix;
    }

    return streams;
}
