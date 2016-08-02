'use strict';

module.exports = {

    OPTIONS: options(),

    REQMOD: {
        noBody: reqmodNoBody(),
        noPreview: reqmodNoPreview(),
        previewFull: reqmodPreviewFull(),
        preview: reqmodPreview(),
        previewContinue: reqmodPreviewContinue()
    }

};

function options() {
    return [
        'OPTIONS icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Allow: 206',
        '',
        ''
    ].join('\r\n');
}

function reqmodNoBody() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 07:56:17 GMT',
        'Encapsulated: req-hdr=0, null-body=92',
        'Preview: 0',
        'Allow: 204',
        '',
        'GET http://localhost:58285/ HTTP/1.1',
        'X-Change-Me: my-test-header',
        'Host: localhost:58285',
        '',
        ''
    ].join('\r\n');
}

function reqmodNoPreview() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:26:22 GMT',
        'Encapsulated: req-hdr=0, req-body=133',
        'Allow: 204',
        '',
        'POST http://localhost:39985/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 17',
        'Host: localhost:39985',
        '',
        '11',
        'testkey=testvalue',
        '0',
        '',
        ''
    ].join('\r\n');
}

function reqmodPreviewFull() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:24:40 GMT',
        'Encapsulated: req-hdr=0, req-body=133',
        'Preview: 17',
        'Allow: 204',
        '',
        'POST http://localhost:42633/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 17',
        'Host: localhost:42633',
        '',
        '11',
        'testkey=testvalue',
        '0; ieof',
        '',
        ''
    ].join('\r\n');
}

function reqmodPreview() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:16:43 GMT',
        'Encapsulated: req-hdr=0, req-body=137',
        'Preview: 10',
        '',
        'POST http://localhost:48191/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 494989',
        'Host: localhost:48191',
        '',
        'a',
        'k0=valueva',
        '0',
        '',
        ''
    ].join('\r\n');
}

function reqmodPreviewContinue() {
    return [
        '3db',
        'luevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevalue&k1=valuevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevaluevalue' +
        'valuevaluevaluevalue',
        '0',
        '',
        ''
    ].join('\r\n');
}
