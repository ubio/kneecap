'use strict';

const HEADER_ISTAG = `"kneecap-itag-${Math.random()}"`;
const NEWLINE = '\r\n';
const PAYLOAD_SEPARATOR = Buffer.from('\r\n\r\n');

const stream = require('stream');
const Splicer = require('stream-splicer');
const debug = require('debug');

class Response extends Splicer {
    constructor(spec) {
        debug('constructor');
        const {statusCode, statusText} = spec;
        const headers = spec.headers || new Map();

        const lines = [];

        const line1 = `ICAP/1.0 ${statusCode} ${statusText}`;
        lines.push(line1);

        getMandatoryHeaders().forEach(element => {
            if (!headers.has(element[0])) {
                headers.set(element[0], element[1]);
            }
        });
        headers.forEach((value, key) => {
            const line = `${key}: ${value}`;
            lines.push(line);
        });

        const icapRegion = Buffer.from(lines.join(NEWLINE));

        const writer = new stream.PassThrough();
        const response = super([writer]);
        writer.push(icapRegion);
        writer.push(PAYLOAD_SEPARATOR);
        writer.push(null);
        return response;
    }
}

module.exports = Response;

function getMandatoryHeaders() {
    const isTag = ['ISTag', HEADER_ISTAG];
    const date = ['Date', new Date().toGMTString()];
    return [isTag, date];
}
