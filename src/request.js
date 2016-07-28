'use strict';

module.exports = function createIcapRequest(icapDetails, transaction) {
    return Object.freeze({
        hasRequestHeaders,
        hasRequestBody,
        hasResponseHeaders,
        hasResponseBody,
        getRequestHeaders,
        getRawRequestHeaders,
        getRawRequestBody,
        getResponseHeaders,
        getRawResponseHeaders,
        getRawResponseBody
    });

    function hasRequestHeaders() {
        return transaction.hasEncapsulatedSection('req-hdr');
    }

    function hasRequestBody() {
        return transaction.hasEncapsulatedSection('req-body');
    }

    function hasResponseHeaders() {
        return transaction.hasEncapsulatedSection('res-hdr');
    }

    function hasResponseBody() {
        return transaction.hasEncapsulatedSection('res-body');
    }

    function getRequestHeaders() {
        return getHeaders('req-hdr');
    }

    function getResponseHeaders() {
        return getHeaders('res-hdr');
    }

    function getRawRequestHeaders() {
        return getRawHeaders('req-hdr');
    }

    function getRawResponseHeaders() {
        return getRawHeaders('res-hdr');
    }

    function getHeaders(name) {
        return getRawHeaders(name)
            .then(buffer => parseHeaders(buffer));
    }

    function getRawHeaders(section) {
        return transaction.waitForEncapsulatedSection(section);
    }
    
    function getRawRequestBody() {
        return getRawBody('req-body');
    }

    function getRawResponseBody() {
        return getRawBody('res-body');
    }

    function getRawBody(section) {
        if (!icapDetails.encapsulated.has(section)) {
            return Promise.resolve('');
        }
        return transaction.getFullBody();
    }
    
};

function parseHeaders(buffer) {
    return buffer.toString();
}
