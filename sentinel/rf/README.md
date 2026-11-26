# EXOpace RF Scan

A browser port of [RF Sentinel](https://github.com/CIS-C0/RFSentinel) detection
signatures for the EXOpace Sentinel surface. This directory is licensed under
**GPL-3.0-or-later**. See `LICENSE` and `NOTICE`.

What the web page can do:

- Match RF Sentinel BLE signatures (payload tags, Bluetooth company IDs,
  service UUIDs, and advertised names) when Web Bluetooth hears a device.
- Use `requestLEScan` for a nearby scan where the browser supports it, or the
  device picker plus `watchAdvertisements` otherwise.
- Keep detections on this device (IndexedDB), alert on probable/strong hits,
  and export or share the log.
- Optionally listen to a USB ESP32 over Web Serial and classify only clearly
  labeled SSID/MAC lines from recognized or verbose firmware.

What it cannot do, and will not fake:

- Native WiFi scans, probe-request fingerprints, or `Flock-` SSIDs without
  hardware that reports them.
- Cell-tower / IMSI-catcher checks, GNSS jamming signs, USB WiFi adapters that
  are not exposed as serial text, or Android-only background scanning.
- OUI / MAC prefix matching on typical Web Bluetooth advertisements, because
  browsers hide Bluetooth addresses.

Run the matcher tests:

```
node sentinel/rf/matcher.test.mjs
```
