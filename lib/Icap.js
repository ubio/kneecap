'use strict';

const STATUS_CODE_OK = 200;
const STATUS_TEXT_OK = 'OK';

const STATUS_CODE_BAD = 400;
const STATUS_TEXT_BAD = 'Bad Request';

const url = require('url');

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
    }

    options(options) {
        const {method, transfer, previewBytes} = options;
    }
}

module.exports = Icap;

// Private instance methods

function respond(icap, spec) {
    const response = createResponse(spec);
    icapSession.send(response);
}
