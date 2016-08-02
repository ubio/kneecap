'use strict';

const PROXY_PORT = 8000;
const ICAP_PORT = 8001;
const HTTP_TEST_PORT = 8002;

const PROXY_HOST = process.env.PROXY_HOST || 'localhost';

// Must be your host's address, different than localhost when using docker
const LOCAL_IP_ADDRESS = process.env.LOCAL_IP_ADDRESS || '127.0.0.1';

const PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}/`;

const createServer = require('../src/server.js');
const http = require('http');
const EventEmitter = require('events').EventEmitter;

const request = require('request');
const bodyParser = require('body-parser');

const urlencodedParser = bodyParser.urlencoded({
    extended: false,
    limit: '10mb'
});

describe('ICAP server', () => {

    const events = new EventEmitter();

    let server = null;

    before(() => {
        server = createServer();
        server.listen(ICAP_PORT);
    });

    after(() => {
        server.close();
    });

    before(() => createHttpServer());

    context('reqmod', () => {

        context('do not change with preview', () => {

            before(() => {
                server.requestHandler('/request', () => Promise.resolve());
            });

            it('should not transform request headers', done => {
                const headers = {
                    'x-unmodified': 'Hello'
                };
                events.once('request', req => {
                    Object.keys(headers)
                        .forEach(name => {
                            req.headers[name].should.equal(headers[name]);
                        });
                    done();
                });
                makeRequest('GET', headers);
            });

            it('should not transform request bodies', done => {
                const obj = createLargeObject(100);
                events.once('request', req => {
                    Object.keys(obj).forEach(key => {
                        req.body[key].should.equal(obj[key]);
                    });
                    done();
                });
                makeRequest('POST', {}, obj);
            });

        });

        context('do not change without preview', () => {

            before(() => {
                server.requestHandler('/request', {
                    transfer: {
                        complete: '*'
                    },
                    previewBytes: null
                }, () => Promise.resolve());
            });

            it('should not transform request headers', done => {
                const headers = {
                    'x-unmodified': 'Hello'
                };
                events.once('request', req => {
                    Object.keys(headers)
                        .forEach(name => {
                            req.headers[name].should.equal(headers[name]);
                        });
                    done();
                });
                makeRequest('GET', headers);
            });

            it('should not transform request bodies', done => {
                const obj = createLargeObject(300);
                events.once('request', req => {
                    Object.keys(obj).forEach(key => {
                        req.body[key].should.equal(obj[key]);
                    });
                    done();
                });
                makeRequest('POST', {}, obj);
            });

        });

    });

    function makeRequest(method, headers, form) {
        return new Promise((resolve, reject) => {
            request({
                method,
                url: `http://${LOCAL_IP_ADDRESS}:${HTTP_TEST_PORT}/`,
                proxy: PROXY_URL,
                headers,
                form
            }, (err, resp) => {
                return err ? reject(err) : resolve(resp);
            });
        });
    }

    function createLargeObject(num) {
        return Array.from(Array(num))
            .reduce((prev, _, ix) => (prev['k' + ix] = 'value'.repeat(num)) && prev, {});
    }

    function createHttpServer() {
        const server = http.createServer((req, res) => {
            urlencodedParser(req, res, () => {
                events.emit('request', req, res);
            });
        });
        return new Promise(resolve => server.listen(HTTP_TEST_PORT, resolve));
    }

});
