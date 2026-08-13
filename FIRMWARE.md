# EXOpace Heltec V4 — firmware contract

Hardware: **Heltec WiFi LoRa 32 V4 Expansion Kit** — ESP32-S3R2 + SX1262, ST7789 240×320 touch TFT, GNSS, battery, ~28 dBm-class PA.

Canonical tree today: `jessy:/home/arduino/nodelink` (v2.1 on the board).  
This folder is the Phase-3 contract + starter. **Custom EXOpace JSON is canonical. Not Meshtastic.**

Phone Demo never depends on this firmware.

---

## Identity

| Item | Value |
|------|--------|
| BLE name | `EXOpace-XXXX` (last 4 of node id) |
| BLE UART | Nordic `6e400001` / `002` write / `003` notify |
| Wi-Fi AP | `EXOpace-XXXX` / password `nodelink` (min 8; change in SET) |
| WebSocket | `ws://192.168.4.1/ws` |
| Pairing | **App-only GATT.** Never require Android Settings pair. |

`XXXX` = last 4 hex of node id (same as today `7B52F8E3` → `F8E3`).

---

## JSON types (newline-delimited UTF-8)

Preserve: `hello`, `cfg`, `chat`, `hist`, `ack`, `gps`, `telem`, `nodes`, `sys`, `setcfg`, `getcfg`.

Add:

```json
{"t":"sos","id":"7b52f8e3","lat":35.15,"lon":-90.05,"msg":"SOS","ts":1770000000}
{"t":"way","id":"w1","name":"RV-B","lat":35.16,"lon":-90.02,"kind":"meet"}
{"t":"track","id":"7b52f8e3","pts":[[35.15,-90.05,1770000000]]}
{"t":"rf","id":"7b52f8e3","rssi":-91,"snr":6.2,"lat":35.15,"lon":-90.05}
{"t":"presence","id":"a1b2c3d4","conf":0.64,"ago":80}
{"t":"time","mode":"live","epoch":1770000000,"rate":1}
```

`kind` ∈ `meet|hazard|cache|home`.  
`cfg` **must not** echo the channel key. Send `"keySet":true|false` only.

GPS: send `gps` only when fix quality is acceptable (sats ≥ 4 and HDOP < 5 if the module reports it).

---

## LoRa wire (existing v2, magic `0x4C32`)

Existing: `P_CHAT=1 P_POS=2 P_TELEM=3 P_ACK=4 P_HELLO=5`  
Add: `P_SOS=6 P_WAY=7 P_RF=8` (payload = packed lat/lon + short text / kind).

Flood + AES-256-GCM rules unchanged. Relays do not need the key.

---

## Touch UI (portrait-primary)

Tabs: **Chat | Status | Nodes | Settings**

On-screen keyboard: A–Z, 0–9, space, backspace, enter, symbols. Targets ≥ 28 px.

Power profiles:

| Profile | Screen | GPS interval | BLE | TX |
|---------|--------|--------------|-----|-----|
| FIELD | on | 15–30 s | on | normal |
| RELAY | dim | 60 s | on | aggressive (higher duty) |
| SAVE | dim | 120–300 s | off after idle | low |

---

## RF front-end (do not “fix”)

| Pin | Role |
|-----|------|
| GPIO2 | FEM CSD **HIGH** when TX/RX awake |
| GPIO7 | VFEM **HIGH** when awake |
| GPIO46 | **Do not toggle** |
| Vext GPIO36 | **LOW** = peripherals on |
| SX1262 | TCXO **1.8 V**, `setDio2AsRfSwitch(true)` |
| Battery | ADC GPIO1, ADC_CTRL 37 **HIGH**, divider 4.9 |

Sleep: drop FEM CSD/VFEM **after** radio standby. Measure before claiming mA.

**Targets (measure, don’t invent):**

| State | Aim |
|-------|-----|
| FIELD, screen on, GPS fix, BLE connected | < 180 mA avg |
| SAVE, screen dim, GPS 120 s, BLE off | < 25 mA avg |
| Deep sleep between GPS | < 2 mA (FEM off) |

---

## SOS

Physical combo (document on the faceplate): **PWR + bottom-left touch 1.2 s** → emit `{"t":"sos",...}` on LoRa + WS + BLE.

---

## Flash (dj has the USB)

```
export PLATFORMIO_CORE_DIR=/mnt/gsdata/platformio-core
export PATH=/home/arduino/.local/share/pio-venv/bin:$PATH
cd /home/arduino/nodelink && pio run -e heltec_v4
# copy firmware.bin to dj; esptool write-flash 0x10000
```

Starter in this folder (`exopace_v4/`) is the Phase-3 overlay (BLE UART + new types + OSK sketch). Merge into `nodelink` — do not run a second firmware family on the same board.

---

## AP name cutover

v2.1 advertised `NodeLink-XXXX`. Phase 3 advertises `EXOpace-XXXX`. Password still `nodelink` until SET changes it. Radio PWA already filters `namePrefix: "EXOpace"`.
