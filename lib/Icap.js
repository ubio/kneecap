'use strict';

const STATUS_CODE_OK = 200;
const STATUS_TEXT_OK = 'OK';

const STATUS_CODE_BAD = 400;
const STATUS_TEXT_BAD = 'Bad Request';

const url = require('url');
const assert = require('assert');
const Response = require('./streams/Response.js');

class Icap {
    constructor(icapSession) {
        this.icapSession = icapSession;
        this.details = icapSession.details; // instance of IcapDetails
    }

    get path() {
        return url.parse(this.details.url).pathname;
    }

    get method() {
        return this.details.method;
    }

    badRequest() {
        respond(this, {
            statusCode: STATUS_CODE_BAD,
            statusText: STATUS_TEXT_BAD
        });
    }

    options(options) {
        const {method, transfer, previewBytes} = options;
        const headers = [['Methods', method]];
        if (transfer.complete) {
            headers.push(['Transfer-Complete', transfer.complete]);
        }
        if (transfer.ignore) {
            headers.push(['Transfer-Ignore', transfer.ignore]);
        }
        if (transfer.preview) {
            headers.push(['Transfer-Preview', transfer.preview]);
        }
        if (typeof previewBytes !== undefined) {
            headers.push(['Preview', previewBytes]);
        }
        respond(this, {
            statusCode: STATUS_CODE_OK,
            statusText: STATUS_TEXT_OK,
            headers: new Map(headers)
        });
    }

    hasRequestHeaders() {
        return this.details.hasEncapsulatedRegion('req-hdr');
    }

    hasResponseHeaders() {
        return this.details.hasEncapsulatedRegion('res-hdr');
    }

    hasRequestBody() {
        return this.details.hasEncapsulatedRegion('req-body');
    }

    hasResponseBody() {
        return this.details.hasEncapsulatedRegion('res-body');
    }

    hasPreview() {
        return this.details.hasPreview();
    }

    getRequestHeadersStream() {
        assert(this.hasRequestHeaders(), 'Request headers not available');
        return this.icapSession.getStream('req-hdr');
    }

    getResponseHeadersStream() {
        assert(this.hasResponseHeaders(), 'Response headers not available');
        return this.icapSession.getStream('res-hdr');
    }

    getRequestBodyStream() {
        assert(this.hasRequestBody(), 'Request body not available');
        return getBodyStream(this, 'req-body');
    }

    getResponseBodyStream() {
        assert(this.hasResponseBody(), 'Response body not available');
        return getBodyStream(this, 'req-body');
    }

    getPreviewStream() {
        assert(this.hasPreview(), 'Preview not available');
    }

    getRequestHeadersRaw() {
        assert(this.hasRequestHeaders(), 'Request headers not available');
    }

    getResponseHeadersRaw() {
        assert(this.hasResponseHeaders(), 'Response headers not available');
    }

    getRequestBodyRaw() {
        assert(this.hasRequestBody(), 'Request body not available');
    }

    getResponseBodyRaw() {
        assert(this.hasResponseBody(), 'Response body not available');
    }

    getPreviewRaw() {
        assert(this.hasPreview(), 'Preview not available');
    }
}

module.exports = Icap;

// Private instance methods

function respond(icap, spec) {
    const response = new Response(spec);
    icap.icapSession.send(response);
}

function getBodyStream(icap, region) {
    const stream = icap.icapSession.getFullBodyStream();
}
