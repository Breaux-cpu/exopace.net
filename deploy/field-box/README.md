# Field box

Local stack for a laptop or mini-PC. It serves this repository, a PMTiles directory, the SDR bridge, and MongoDB.

`EXOPACE_ALLOW_DEMO` stays false. Set `EXOPACE_BRIDGE_TOKEN` in the shell before `docker compose up`. The bridge stays closed until that token is set. Do not put the token in this file.

The cams app is built on `vq` and is not included here. Point `cams.exopace.local` at that image when you have it.
