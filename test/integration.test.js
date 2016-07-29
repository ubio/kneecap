'use strict';

const PROXY_PORT = 8000; // Must be the same as http_port in test/squid.conf
const ICAP_PORT = 8001; // Must be the same as icap_service in test/squid.conf

// const PROXY_HOST = 'localhost';
const PROXY_HOST = '192.168.99.100';

const PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}/`;

const childProcess = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
const qs = require('querystring');
const request = require('request');
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({
    extended: false
});
const should = require('should');
const kneecap = require('../src/server.js');

describe('integration', () => {
    let _server, _proxyPid, icapServer;
    let waitForRequest = Promise.reject(new Error('waitForRequest not changed'));

    function initializeWaitForRequest(server) {
        waitForRequest = new Promise(resolve => {
            server.on('request', (req, res) => {
                urlencodedParser(req, res, () => {
                    resolve({req, res});
                });
            });
        });
    }

    function makeRequest(method, headers, form) {
        return request({
            url: `http://192.168.0.2:${_server.address().port}/`,
            proxy: PROXY_URL,
            method,
            headers,
            form
        }, err => {
            err && console.log('request error', err);
        });
    }

    before(() => {
        return createIcapServer()
            .then(server => {
                icapServer = server;
                // return startProxy();
            });
            // .then(proxyPid => {
            //     _proxyPid = proxyPid;
            // });
    });
    beforeEach(() => {
        return getListeningHttpServer()
            .then(server => {
                _server = server;
                initializeWaitForRequest(server);
            });
    });
    afterEach(() => {
        waitForRequest = Promise.reject(new Error('waitForRequest not set'));
        return closeHttpServer(_server)
            .then(() => {
                _server = null;
            });
    });
    // after(() => {
        // return stopProxy(_proxyPid);
    // });

    it('should forward requests untouched', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.requestHandler('/request', () => Promise.resolve());
        makeRequest('GET', headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                req.headers[myHeaderName.toLowerCase()].should.equal(myHeaderValue);
            });
    });

    it('should change request headers', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.requestHandler('/request', function(request) {
            return request.getRequestHeaders()
                .then(headers => {
                    return {
                        requestHeaders: headers.replace(myHeaderName, `${myHeaderName}-Changed`)
                    };
                });
        });
        makeRequest('GET', headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                should.not.exist(req.headers[myHeaderName.toLowerCase()]);
            });
    });

    it('should change request header values', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header-value';
        const expectedHeaderValue = 'my-changed-header-value';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.requestHandler('/request', function(request) {
            return request.getRequestHeaders()
                .then(headers => {
                    return {
                        requestHeaders: headers.replace(myHeaderValue, expectedHeaderValue)
                    };
                });
        });
        makeRequest('GET', headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                req.headers[myHeaderName.toLowerCase()].should.equal(expectedHeaderValue);
            });
    });

    it('should change request body values', () => {
        const myFormKey = 'testkey';
        const myFormValue = 'testvalue';
        const expectedBodyValue = 'changedtestvalue';
        const form = {};
        form[myFormKey] = myFormValue;
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawRequestBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    const diff = expectedBodyValue.length - myFormValue.length;
                    const oldContentLength = Number(requestHeaders.match(/content-length: (\d+)/i)[1]);
                    return {
                        requestBody: Buffer.from(requestBody.toString().replace(myFormValue, expectedBodyValue)),
                        requestHeaders: requestHeaders.replace(/content-length: (\d+)/i, `Content-Length: ${oldContentLength + diff}`)
                    };
                });
        });
        makeRequest('POST', undefined, form);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();
                req.body[myFormKey].should.equal(expectedBodyValue);
            });
    });

    it('should change large request body values', () => {
        const form = getLargeObject();
        const expectedBody = 'replaced=value';
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawRequestBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    const contentLength = expectedBody.length;
                    requestBody;
                    return {
                        requestBody: Buffer.from(expectedBody),
                        requestHeaders: requestHeaders.replace(/content-length: (\d+)/i, `Content-Length: ${contentLength}`)
                    };
                });
        });
        makeRequest('POST', undefined, form);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();
                req.body.replaced.should.equal('value');
            });
    });

    it('should correctly parse large request bodies', done => {
        const form = getLargeObject(99);
        icapServer.requestHandler('/request', function(request) {
            return request.getRawRequestBody()
                .then(body => {
                    Object.keys(qs.parse(body.toString())).length.should.equal(Object.keys(form).length);
                    done();
                })
                .catch(done);
        });
        makeRequest('POST', undefined, form);
        Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();
                req.body.replaced.should.equal('value');
            });
    });
});

function getLargeObject(length = 99) {
    return Array.from({length}).reduce((prev, _, ix) => (prev['k' + ix] = 'value'.repeat(length)) && prev, {});
}

function createIcapServer() {
    return Promise.resolve()
        .then(() => {
            const server = kneecap();
            server.listen(ICAP_PORT);
            return new Promise(resolve => setTimeout(() => resolve(server), 500));
        });
    // return Promise.resolve(kneecap(ICAP_PORT));
}

function getListeningHttpServer() {
    return Promise.resolve()
        .then(() => {
            const server = http.createServer();
            server.listen(0);
            return new Promise(resolve => {
                server.on('listening', () => resolve(server));
            });
        });
}

function closeHttpServer(server) {
    return Promise.resolve(server)
        .then((server) => {
            if (server) {
                return new Promise(resolve => {
                    server.close(resolve);
                });
            }
        });
}

function startProxy() {
    const configPath = path.join(__dirname, 'squid.conf');
    const proc = childProcess.spawn('squid3', ['-N', '-f', configPath, '-a', PROXY_PORT]);
    // const proc = childProcess.spawn('docker',
    //     ['run', '--net=host', '--name=roxi-squid', 'universalbasket/roxi-squid']);
    return Promise.resolve(proc)
        .then(proc => {
            return waitForPortListening(PROXY_PORT)
                .then(() => proc.pid);
        });
}

function waitForPortListening(port) {
    return retry(0);

    function retry(attempt) {
        if (attempt > 50) {
            const err = new Error('waitForPortListening attempts limit reached');
            throw err;
        }
        return assertPortListening(port)
            .catch(() => {
                return promiseTimeout(100)
                    .then(() => {
                        return retry(attempt + 1);
                    });
            });
    }
}

function waitForPortNotListening(port) {
    return retry(0);

    function retry(attempt) {
        if (attempt > 50) {
            const err = new Error('waitForPortNotListening attempts limit reached');
            throw err;
        }
        return assertPortNotListening(port)
            .catch(() => {
                return promiseTimeout(100)
                    .then(() => {
                        return retry(attempt + 1);
                    });
            });
    }
}

function assertPortNotListening(port) {
    return new Promise((resolve, reject) => {
        const connection = new net.Socket();
        connection.connect(port, PROXY_HOST);
        connection.on('error', resolve);
        connection.on('connect', () => {
            reject();
            connection.end();
        });
    });
}

function assertPortListening(port) {
    return new Promise((resolve, reject) => {
        const connection = new net.Socket();
        connection.connect(port, PROXY_HOST);
        connection.on('error', reject);
        connection.on('connect', () => {
            resolve();
            connection.end();
        });
    });
}

function stopProxy(pid) {
    childProcess.spawn('kill', ['-2', pid]);
    childProcess.spawn('docker', ['rm', '-f', 'roxi-squid']);
    return waitForPortNotListening(PROXY_PORT);
}

function promiseTimeout(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

