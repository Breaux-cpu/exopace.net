# EXOpace SDR bridge

Optional archived headless relay. The visitor path is **CONNECT USB SDR** (WebUSB) on `/radio/` and **CONNECT USB NODE** (Web Serial) on `/mesh/` and `/maps/`. This process only matters on a machine that already runs `rtl_tcp`. The browser connects with a bearer token.

Set `EXOPACE_BRIDGE_TOKEN` before starting. An empty token rejects every handshake with close code 4401. The bridge does not invent spectrum. With no `rtl_tcp` session it sends status `STANDBY` and no FFT or audio frames.

```
pip install -r requirements.txt
EXOPACE_BRIDGE_TOKEN=... python exo_sdr_bridge.py
```

`python exo_sdr_bridge.py --self-test` prints the packet framing and the unauthorized result. It does not open a radio.
