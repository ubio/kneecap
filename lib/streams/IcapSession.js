'use strict';

const Splicer = require('stream-splicer');
const stream = require('stream');
const debug = require('debug')('IcapSession');
const parser = require('../parser.js');
const EndlessPassThrough = require('./EndlessPassThrough.js');
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
        const writer = new EndlessPassThrough();
        const icapSession = super([reader, stopper, writer]);
        icapSession.reader = reader;
        icapSession.stopper = stopper;
        icapSession.writer = writer;

        icapSession.details = parser.parseIcapDetails(buffer);

        const previewMode = icapSession.details.headers.has('preview');
        icapSession.streams = getRegionStreams(icapSession.details, previewMode);
        cycleReaderStreams(reader, icapSession.streams);

        return icapSession;
    }

    async send(stream) {
        stream.pipe(this.writer);
        await waitForEnd(stream);
        stream.unpipe(this.writer);
        this.emit('end');
    }
}

module.exports = IcapSession;

// Private instance methods

// Helpers

async function waitForEnd(stream) {
    return new Promise(resolve => {
        if (stream._readableState.ended) { // TODO: don't use private props
            return resolve();
        }
        stream.once('end', resolve);
    });
}

async function cycleReaderStreams(reader, streams) {
    const unshifts = [];
    for (let i = 0; i < streams.length; ++i) {
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
