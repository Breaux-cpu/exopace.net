# EXOpace SDR Sensor Agent (production)

Operator-owned SDR decoders → this agent → authenticated ingest → MOC AIRCRAFT / SHIPS / FEEDS.

**Not a dragnet.** You run readsb / AIS-catcher. We only parse their published JSON.

Prod has **no** `--demo` / `--fake` / sample-track mode. `EXOPACE_FAKE` is refused when `EXOPACE_ENV=prod`.

## Install decoders (upstream)

- ADS-B: [wiedehopf/readsb](https://github.com/wiedehopf/readsb) + tar1090. Default JSON: `http://127.0.0.1:8080/data/aircraft.json`
- Optional JSON line port: readsb `--net-json-port 30047`
- AIS: [jvde-git/AIS-catcher](https://github.com/jvde-git/AIS-catcher) with MQTT (`ais/#`) or TCP JSON_FULL

Bind decoder ports to **localhost**.

One dongle per band. Do not share an RTL-SDR between readsb and AIS-catcher.

## Agent

```
cd /mnt/gsdata/exopace/sdr-agent
cp config.example.yaml config.yaml   # edit urls; do not commit
python3 /mnt/gsdata/exopace/bridge/token_tool.py mint sdr1
export EXOPACE_ENV=prod
export EXOPACE_SDR_TOKEN='exo_…'     # never git
python3 src/main.py -c config.yaml
```

systemd:

```
# /etc/exopace/sdr-agent.env   EXOPACE_SDR_TOKEN=…
# /etc/exopace/sdr-agent.yaml  copy of config.yaml
systemctl enable --now exopace-sdr-agent
```

Docker: `Dockerfile` is **agent only**. Decoders stay on the host or sibling containers.

## Env

| Var | Required | Notes |
|-----|----------|--------|
| `EXOPACE_ENV` | yes | `prod` |
| `EXOPACE_SDR_TOKEN` | yes | ingest Bearer (hash stored on bridge) |
| `EXOPACE_SDR_CONFIG` | no | path to yaml (default `config.yaml`) |

`bridge_url` in yaml: `http://127.0.0.1:8220/ingest` (working LAN). Public `wss://exopace.net/bridge/sensor` is not a Pages route yet.

## Firewall

Keep `:8080` / `:30047` / `:1883` / `:4002` on loopback.

## Legal

The operator is responsible for lawful reception. This agent does not demodulate and does not decode private voice/comms.

## E2E

1. readsb serving real `aircraft.json` + valid token → ingest `/tracks?kind=adsb` within one poll; FEEDS AIR = ADSB.
2. Stop readsb → `sdr_health` down after `stale_after_sec`; tracks expire (`ttl`); no new planes.
3. Bad token → HTTP 401, agent logs `auth failure`.
4. AIS source with real AIS-catcher JSON → `/tracks?kind=ais`; disable source → no synthetic ships.
5. `python3 src/main.py --demo` exits; no demo flag in prod.
