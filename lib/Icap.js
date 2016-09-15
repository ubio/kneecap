'use strict';

const STATUS_CODE_OK = 200;
const STATUS_TEXT_OK = 'OK';

const STATUS_CODE_BAD = 400;
const STATUS_TEXT_BAD = 'Bad Request';

const url = require('url');
const Response = require('./streams/Response.js');

class Icap {
    constructor(icapSession) {
        this.icapSession = icapSession;
    }

    get path() {
        return url.parse(this.icapSession.details.url).pathname;
    }

    get method() {
        return this.icapSession.details.method;
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
}

module.exports = Icap;

// Private instance methods

function respond(icap, spec) {
    const response = new Response(spec);
    icap.icapSession.send(response);
}
