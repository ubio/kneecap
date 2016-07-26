KC = kneecap

# Testing

```
npm test
```

# How it works

A KC instance allows a single endpoint per http request/response, hardcoded `/request` or `/response`.

A single callback can be attached to each endpoint, which must return a promise.

```js
require('kneecap')(ICAP_PORT)
    .then(server => {
        server.setRequestModifier(request => {
            const headers = request.getRequestHeaders(); // sync
            if (!headers.includes('x-my-header')) {
                return;
            }
            return request.getRequestBody() // async, promisified
                .then(body => {
                    return {
                        reqHeader: headers.replace(/content-length: \d+/i, 'content-length: 999'),
                        reqBody: body.replace(/foo/, 'barbaz')
                    };
                });
        });
    });
```

## Requests manipulation

- listen to requests on `/request` endpoint

## Response manipulation

// TODO
