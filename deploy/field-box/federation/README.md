# Field-box federation

Optional stateless relay for ciphertext already sealed by the room module. It is not part of the default field-box compose. Start it only when two disconnected nodes need a forwarder:

```
docker compose -f deploy/field-box/federation/docker-compose.yml up -d
```

`EXOPACE_ALLOW_DEMO` stays false. The relay does not store `EXOPACE_BRIDGE_TOKEN`, passphrases, or coordinates. `GET /health` reports `stored: false`. `POST /` accepts `kind` of `sentinel`, `tle`, or `room` plus an AES-GCM `cipher` and returns that cipher without writing it.
