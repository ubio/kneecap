'use strict';

module.exports = function createIcapRequest(icapDetails, transaction) {
    return Object.freeze({
        getRequestHeaders,
        getRequestBody,
        getResponseHeaders,
        getResponseBody
    });

    function getRequestHeaders() {
        return getHeaders('req-hdr');
    }

    function getResponseHeaders() {
        return getHeaders('res-hdr');
    }

    function getHeaders(section) {
        if (!icapDetails.encapsulated.has(section)) {
            return Promise.resolve('');
        }
        const data = transaction.getEncapsulatedSection(section);
        if (data) {
            return Promise.resolve(parseHeaders(data));
        }
        return onEvent(section)
            .then(data => {
                return parseHeaders(data);
            });
    }

    function getRequestBody() {
        return getBody('req-body');
    }

    function getResponseBody() {
        return getBody('res-body');
    }

    function getBody(section) {
        if (!icapDetails.encapsulated.has(section)) {
            return Promise.resolve('');
        }
        return transaction.getFullBody();
    }

    function onEvent(section) {
        return new Promise((resolve, reject) => {
            transaction.events.on('socket-closed', handleSocketClose);
            transaction.events.on(section, handleSection);
            function handleSection(data) {
                cleanup();
                resolve(data);
            }
            function handleSocketClose() {
                cleanup();
                const err = new Error('Socket closed while waiting for section');
                err.details = {
                    section
                };
                reject(err);
            }
            function cleanup() {
                transaction.events.removeListener('socket-closed', handleSocketClose);
                transaction.events.removeListener(section, handleSection);
            }
        });
    }
};

function parseHeaders(buffer) {
    return buffer.toString();
}
