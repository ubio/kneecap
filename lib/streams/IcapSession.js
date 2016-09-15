'use strict';

const Splicer = require('stream-splicer');
const stream = require('stream');
const debug = require('debug')('IcapSession');
const parser = require('../parser.js');
const HttpHeadersStream = require('./HttpHeaders.js');
const BodyStream = require('./Body.js');
const PreviewStream = require('./Preview.js');

class IcapSession extends Splicer {
    constructor(buffer) {
        debug('constructor');
        const reader = new stream.PassThrough();
        const stopper = new stream.Transform({
            transform: (b, e, cb) => cb()
        });
        const writer = new stream.PassThrough();
        const icapSession = super([reader, stopper, writer]);
        icapSession.reader = reader;
        icapSession.stopper = stopper;
        icapSession.writer = writer;

        icapSession.details = parser.parseIcapDetails(buffer);

        const previewMode = icapSession.details.headers.has('preview');
        const streams = getRegionStreams(icapSession.details, previewMode);
        cycleReaderStreams(reader, streams);

        return icapSession;
    }

    send(stream) {
        // stream will emit 'end' event, so it cannot be piped, otherwise
        // all the streams in the pipeline will be closed
        stream.pipe(this.writer);
    }

    // TODO
    // How to handle both receiving and sending, but not as a single pipeline?
    // TODO
}

module.exports = IcapSession;

// Private instance methods

// Helpers

async function cycleReaderStreams(reader, streams) {
    for (let i = 0; i < streams.length; ++i) {
        const stream = streams[i];
        reader.pipe(stream);
        await stream.waitUntilDone();
        reader.unpipe(stream);
    }
}

function getRegionStreams(icapDetails, previewMode) {
    const streams = [];

    let ix = 0, region;
    while (region = icapDetails.encapsulatedRegions[ix]) {
        const nextRegion = icapDetails.encapsulatedRegions[ix + 1];
        if (nextRegion) {
            // Only headers can be received before the single *-body
            streams.push(new HttpHeadersStream(region.name, nextRegion.startOffset - region.startOffset));
        } else if (region.name !== 'null-body') {
            // *-body with data
            if (previewMode) {
                streams.push(new PreviewStream(region.name));
            } else {
                streams.push(new BodyStream(region.name));
            }
        } else {
            // null-body
        }
        ++ix;
    }

    return streams;
}
