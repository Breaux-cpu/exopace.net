# EXOpace SDR Agent (production)

Operator-owned SDR → this agent → authenticated ingest.  
**Not a dragnet.** You choose the decoder and what lines you feed it.

## Env

| Var | Required | Example |
|-----|----------|---------|
| `EXOPACE_ENV` | yes | `prod` |
| `EXOPACE_INGEST_URL` | yes | `http://127.0.0.1:8210/ingest` |
| `EXOPACE_DEVICE_TOKEN` | yes | `exo_…` (from `bridge/token_tool.py mint`) |
| `EXOPACE_SDR_SOURCE` | yes | `stdin` · `tcp:127.0.0.1:30003` · `udp:49005` |
| `EXOPACE_SDR_TYPE` | yes | `json` · `adsb` (SBS MSG) · `rf` (`rssi,snr,lat,lon`) |
| `EXOPACE_SDR_DEVICE` | no | `rtl0` |

`EXOPACE_FAKE` is **refused** when `EXOPACE_ENV=prod`.

## Run

```
# mint a token (prints once)
python3 /mnt/gsdata/exopace/bridge/token_tool.py mint sdr1

export EXOPACE_ENV=prod
export EXOPACE_INGEST_URL=http://127.0.0.1:8210/ingest
export EXOPACE_DEVICE_TOKEN='exo_…'
export EXOPACE_SDR_SOURCE=tcp:127.0.0.1:30003
export EXOPACE_SDR_TYPE=adsb
python3 /mnt/gsdata/exopace/sdr-agent/agent.py
```

systemd: `sdr-agent/systemd/exopace-sdr-agent.service` (EnvironmentFile, no token in git).

Docker: `sdr-agent/Dockerfile`.

## Legal

The operator is responsible for what they decode. This agent does not include decoders for unauthorized private comms. AIS/ADS-B parsers here only accept published dump1090 SBS or operator JSON.
