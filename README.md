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
                        requestHeaders: headers.replace(myHeaderName, `${myHeaderName}-Changed`)
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
                        requestHeaders: requestHeaders.replace(/content-length: (\d+)/i, `Content-Length: ${oldContentLength + diff}`)
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

Adds a RESPMOD handler. Same usage as [`requestHandler`](#requestHandler).
