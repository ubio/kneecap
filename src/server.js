'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const createIcapTransaction = require('./transaction.js');
const createIcapRequest = require('./request.js');

module.exports = function createServer(options, listenOptions) {
    const _server = net.createServer(options);
    const events = new EventEmitter();

    const handlers = {
        OPTIONS: {},
        REQMOD: {},
        RESPMOD: {}
    };

    const server = {
        listen,
        events,
        requestHandler,
        responseHandler
    };

    _server.on('connection', handleConnection);
    _server.on('error', handleServerError);

    return Object.freeze(server);

    function handleServerError(err) {
        events.emit('error', err);
    }

    function handleConnection(socket) {
        let currentTransaction = createIcapTransaction(socket);
        handleTransaction(currentTransaction);

        currentTransaction.on('finished', finishedHandler);

        function finishedHandler() {
            unhandleTransaction(currentTransaction);
            currentTransaction = createIcapTransaction(socket);
            handleTransaction(currentTransaction);
        }
    }

    function handleTransaction(transaction) {
        transaction.on('icap-headers', icapDetails => {
            const method = icapDetails.method; // REQMOD, OPTIONS, RESPMOD
            const path = icapDetails.path; // '/request'
            const handler = handlers[method][path];

            if ('function' === typeof handler) {
                return handler(createIcapRequest(icapDetails, transaction))
                    .then(response => {
                        if (!response) {
                            transaction.dontChange();
                        }
                        return Promise.all([
                            getHeaders(response.reqHeaders, transaction),
                            getHeaders(response.respHeaders, transaction),
                            getBody(response.reqBody, transaction),
                            getBody(response.reqBody, transaction),
                        ]);
                    })
                    .then(results => {
                        const [
                            reqHeaders,
                            respHeaders,
                            reqBody,
                            respBody
                        ] = results;
                        transaction.respond({
                            reqHeaders,
                            respHeaders,
                            reqBody,
                            respBody
                        });
                    })
                    .catch(err => {
                        console.log('handler threw', err);
                        // badRequest(transaction);
                    });
            }
            // badRequest(transaction);
            // statusCode: 400,
            // statusText: 'Bad request',
        });
    }

    function unhandleTransaction(transaction) {
    }

    function requestHandler(path, handler) {
        // TODO: check handler doesn't already exist
        // handlers.OPTIONS[path] = getOptionsRequestHandler();
        handlers.REQMOD[path] = getHandler();
    }

    function getOptionsRequestHandler() {
        return function() {
        };
    }

    function getHandler() {
        return function() {
        };
    }
};

/**
 * Resolve each pending promise property
 *
 * @param {Object} obj - object containing pending promises as props
 * @returns {Promise}
 */
function resolveObjectProps(obj) {
    if (!obj) {
        return Promise.resolve(obj);
    }
    return Promise.all(Object.keys(obj)
        .map(key => Promise.resolve(obj[key])
            .then(val => [key, val]))
    )
        .then(all => all.reduce((prev, curr) => (prev[curr[0]] = curr[1], prev), {}));
}

server.on('connection', socket => {
    let icapTransaction = createIcapTransaction(socket);
    icapTransaction.on('finished', () => {
        // remove icapTransaction from socket
        // new icapTransaction, bind events
        icapTransaction = createIcapTransaction(socket);
    });

    icapTransaction.on('icap-headers', (icapDetails) => {
        // OPTIONS
        // -> /request
        // -> Tranfer-Preview
        // -> Tranfer-Ignore
        //
        // REQMOD
        // -> path
        //
        // getRequestBody()
        // -> toString(Content-Type)
        //
        // -> null return -> Allow 206 ? send 206 : grab body and send full
        // -> header -> grab body and send full
        // -> body/header -> grab body and send full
    });
});

return Object.freeze({
    requestHandler,
    responseHandler
});

function requestHandler(path, handler) {
    registerPath();
    return Promise.resolve(handler())
        .then(result => {
        })
        .catch(() => {
        });
}


/**
 *
 * http headers <= 8KB
 *
 */

server.requestHandler('/request', icapRequest => {
    return icapRequest.getRequestBody()
    return icapRequest.getRequestHeaders()
        .then(headers => {
            return icapRequest.getRequestBody();
        })
        .then(body => {
            return null;
            return {
                reqHeaders: myNewHeaders
            };
        });
});

server.responseHandler('/response', icapRequest => {
    return icapRequest.getRequestHeaders()
    return icapRequest.getResponseHeaders()
    return icapRequest.getResponseBody();
});
