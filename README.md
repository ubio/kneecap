KC = kneecap

# Testing

```
npm test
```

# How it works

A KC instance only allows separate endpoints per http request/response. A single callback can be attached to each endpoint, which must return a promise.

## Gotchas

- You should make sure `headers['content-length']` is valid (or removed) when changing the request's (or response's) body, otherwise the data may end up truncated.
- Getting the preview is a lot faster than getting the full body. Use `request.getPreivew()` where possible.

## Examples

### Change request headers

```js
        icapServer.requestHandler('/request', function(request) {
            return request.getRequestHeaders()
                .then(headers => {
                    return {
                        requestHeaders: headers.replace(myHeaderName, `${myHeaderName}-Changed`).substring(0, -2) // the last \r\n\r\n must not be included
                    };
                });
        });
```

### Change request body

```js
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    const diff = expectedBodyValue.length - myFormValue.length;
                    const oldContentLength = Number(requestHeaders.match(/content-length: (\d+)/i)[1]);
                    return {
                        requestBody: Buffer.from(requestBody.toString().replace(myFormValue, expectedBodyValue)),
                        requestHeaders: requestHeaders.replace(/content-length: (\d+)/i, `Content-Length: ${oldContentLength + diff}`).substring(0, -2)
                    };
                });
        });
```

### Don't change anything

```js
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    console.log('Got request', requestHeaders, requestBody);
                    return;
                });
        });
```

### Set request options

```js
        icapServer.requestHandler('/request', {
            previewBytes: 128,
            transfer: {
                complete: ['html', 'js'],
                ignore: ['jpg', 'ogg', 'mp4', 'gif', 'gifv'],
                preview: ['*'],
            }
        }, function(request) {
            return Promise.resolve(request.getPreview())
                .then(previewBody => {
                    console.log('preview', previewBody.toString());
                });
        });
```

# API

## Server instance

### listen

Accepts the same params as node.js's `net` [`server.listen`](https://nodejs.org/api/net.html#net_server_listen_handle_backlog_callback), except for the final callback.

Returns a promise which resolves when listening.

```js
const kneecap = require('kneecap');

const kc = kneecap();
kc.listen(8008)
    .then(() => {
        console.log('listening');
    });
```

### close

Stops the server from accepting new connections. Resolves when remaining connections have been closed.

```js
kc.close()
    .then(() => {
        console.log('icap server closed');
    });
```

### events

Events are emitted on this emitter.

```js
kc.events.on('error', err => {
    console.log('icap server error', err);
});
```

### requestHandler

Adds a REQMOD handler.

> `server.requestHandler(path[, options], callback)`

The `path` must be a string where icap REQMOD requests will be listened to.

The `options` object, when included, will specify the OPTIONS response for the `path` endpoint. Supported options:

- `transfer` object, which must contain at least one child with the all `['*']` setting
    - `complete` array, will be sent as `Transfer-Complete`, i.e. `['html', 'js']`
    - `ignore` array, will be sent as `Transfer-Ignore`, i.e. `['jpg', 'jpeg', 'swf', 'mp4']`
    - `preview` array, will be sent as `Transfer-Preview`, i.e. `['*']`
- `previewBytes` integer, how long should the preview be (where available), in bytes.

```js
kc.requestHandler('/request', {
    previewBytes: 128,
    transfer: {
        complete: ['html', 'js'],
        ignore: ['jpg', 'ogg', 'mp4', 'gif', 'gifv'],
        preview: ['*'],
    }
}, handleRequest);
```

### responseHandler

Adds a RESPMOD handler. Same usage as [`requestHandler`](#requesthandler).

-----

## Request

`IcapRequest` passed to `requestHandler` and `responseHandler` methods.

### hasRequestHeaders

Synchronous, returns a boolean whether the icap request has request headers.

### getRequestHeaders

Returns a promise which resolves to the request headers as a String, most likely separated by `\r\n`.

### getRawRequestHeaders

Returns a promise which resolves to the request headers as a Buffer.

### hasResponseHeaders

Synchronous, returns a boolean whether the icap request has response headers.

### getResponseHeaders

Returns a promise which resolves to the response headers as a String, most likely separated by `\r\n`.

### getRawResponseHeaders

Returns a promise which resolves to the response headers as a Buffer.

### hasBody

Synchronous, returns a boolean whether the icap request has a request or response body (depends on REQMOD/RESPMOD handler type).

### hasPreview

Returns a promise which resolves to a boolean whether the request has a body preview.

### getPreview

Returns a promise which resolves to the request/response body preview as a buffer (depends on REQMOD/RESPMOD handler type). The promise may be resolved synchronously, so call `Promise.resolve(request.getPreview())` as a best practice.

### getRawBody

Returns a promise which resolves to the request/response body as a buffer (depends on REQMOD/RESPMOD handler type).

### getRequest

Returns a promise which resolves to an [`http.ClientRequest`](https://nodejs.org/api/http.html#http_class_http_clientrequest).

### getIcapDetails

Returns the icapDetails object, which is the ICAP request containing the ICAP method and headers. Useful for reading headers such as `x-client-username`.

-----

## Respond

To respond to an icap [`Request`](#request), the request handler must return a promise which resolves to either:

- falsey value (`undefined`, `null`, `false`), which will not modify the request, forwarding it as is. If `Allow: 204` is sent by the icap client, then `204 No Content` will be returned. Otherwise, the request data will be sent back unchanged.
```js
kc.requestHandler('/request', function(request) {
    return null;
});
```

- object containing any combination of `requestHeaders:String`, `requestBody:Buffer`, `responseHeaders:String`, `responseBody:Buffer`. You must only include one body in the response.

```js
kc.requestHandler('/request', function(request) {
    return Promise.all([request.getRequestHeaders(), request.getRawBody()])
        .then(results => {
            const [requestHeaders, requestBody] = results;
            return {
                requestBody: Buffer.from('foo=bar'),
                requestHeaders: requestHeaders.slice(0, -2) // the last \r\n\r\n must not be included
            };
        });
});
```

# License

[Apache 2.0](https://github.com/universalbasket/kneecap/blob/master/LICENSE)

   Copyright 2016 Universal Basket

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
