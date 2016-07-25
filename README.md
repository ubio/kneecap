KC = kneecap

# Testing

```
npm test
```

# How it works

A KC instance allows a single endpoint per http request/response, hardcoded `/request` or `/response`.

    A single callback can be attached to each endpoint.
    OR (TBD)
    Two callbacks can be attached to each endpoint (headers or some decision making, full request)

## Requests manipulation

- listen to requests on `/request` endpoint

## Response manipulation
