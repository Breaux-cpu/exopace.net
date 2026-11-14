/* Military paper style on OpenFreeMap vector tiles, plus imagery and hillshade. */
(function (root) {
  var GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
  var PLANET = "https://tiles.openfreemap.org/planet";

  function build() {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {
        openmaptiles: { type: "vector", url: PLANET },
        imagery: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Esri, Maxar, Earthstar Geographics",
        },
        usgs: {
          type: "raster",
          tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
          attribution: "USGS",
        },
        "hill-esri": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
          attribution: "Esri, USGS, NOAA",
        },
        "hill-local": {
          type: "raster",
          tiles: ["hill://{z}/{x}/{y}"],
          tileSize: 256,
          maxzoom: 15,
        },
        contours: {
          type: "raster",
          tiles: ["contour://{z}/{x}/{y}"],
          tileSize: 256,
          maxzoom: 15,
        },
        grid: { type: "geojson", data: empty() },
        graticule: { type: "geojson", data: empty() },
        sheets: { type: "geojson", data: empty() },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#e6dcc6" } },
        { id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } },
        { id: "usgs", type: "raster", source: "usgs", layout: { visibility: "none" } },
        { id: "hill-esri", type: "raster", source: "hill-esri", paint: { "raster-opacity": 0.45 } },
        { id: "hill-local", type: "raster", source: "hill-local", layout: { visibility: "none" }, paint: { "raster-opacity": 0.9 } },
        wood("land-wood", "wood", "#b7c7a4", 0.55),
        wood("land-grass", "grass", "#d5e0c2", 0.45),
        wood("land-wetland", "wetland", "#c5d5c8", 0.5),
        { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#b7d0e2" } },
        {
          id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway",
          paint: { "line-color": "#6aa4c4", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 16, 3] },
        },
        road("road-motorway-case", ["motorway"], "#6e2c22", 1.6, 5),
        road("road-major-case", ["trunk", "primary", "secondary", "tertiary"], "#8a7044", 1.3, 7),
        road("road-minor-case", ["minor", "service", "track"], "#9a9284", 1.15, 12),
        road("road-motorway", ["motorway"], "#d2563a", 1, 5),
        road("road-major", ["trunk", "primary", "secondary", "tertiary"], "#e6d7a8", 1, 7),
        road("road-minor", ["minor", "service", "track"], "#f7f3ea", 1, 12),
        {
          id: "road-path", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 13,
          filter: ["match", ["get", "class"], ["path", "pedestrian"], true, false],
          paint: { "line-color": "#6b5344", "line-dasharray": [1.2, 0.8], "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 18, 2] },
        },
        {
          id: "rail", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 9,
          filter: ["==", ["get", "class"], "rail"],
          paint: { "line-color": "#3a3a3a", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 1.4] },
        },
        {
          id: "rail-hatch", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12,
          filter: ["==", ["get", "class"], "rail"],
          paint: { "line-color": "#3a3a3a", "line-dasharray": [0.3, 2], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 6] },
        },
        {
          id: "runway", type: "line", source: "openmaptiles", "source-layer": "aeroway", minzoom: 11,
          filter: ["==", ["get", "class"], "runway"],
          paint: { "line-color": "#5c5852", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 10] },
        },
        {
          id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 13,
          paint: { "fill-color": "#ddd4c6", "fill-outline-color": "#8a8174" },
        },
        {
          id: "land-use", type: "fill", source: "openmaptiles", "source-layer": "landuse", minzoom: 8,
          filter: ["match", ["get", "class"], ["park", "cemetery", "military", "quarry"], true, false],
          paint: {
            "fill-color": ["match", ["get", "class"], "park", "#b7c9a2", "cemetery", "#cfc6b8", "military", "#d2c4b0", "quarry", "#c8bba8", "#d5e0c2"],
            "fill-opacity": 0.45,
          },
        },
        { id: "contours", type: "raster", source: "contours", paint: { "raster-opacity": 0.95 } },
        {
          id: "sheets-fill", type: "fill", source: "sheets",
          paint: {
            "fill-color": ["case", ["==", ["get", "active"], 1], "#c2410c", "#0f766e"],
            "fill-opacity": 0.12,
          },
        },
        {
          id: "sheets-line", type: "line", source: "sheets",
          paint: {
            "line-color": ["case", ["==", ["get", "active"], 1], "#9a3412", "#115e59"],
            "line-width": ["case", ["==", ["get", "active"], 1], 2.5, 1.5],
          },
        },
        {
          id: "grid-line", type: "line", source: "grid",
          paint: { "line-color": "#1f2933", "line-opacity": 0.55, "line-width": ["case", ["==", ["get", "major"], 1], 1.1, 0.6] },
        },
        {
          id: "graticule-line", type: "line", source: "graticule",
          paint: { "line-color": "#1d4e89", "line-opacity": 0.45, "line-width": 0.8 },
        },
        label("place-major", "place", ["city", "town"], 4, 15),
        label("place-minor", "place", ["village", "hamlet", "suburb"], 10, 12),
        {
          id: "road-label", type: "symbol", source: "openmaptiles", "source-layer": "transportation", minzoom: 12,
          filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary"], true, false],
          layout: {
            "symbol-placement": "line",
            "text-field": ["coalesce", ["get", "name_en"], ["get", "name"], ""],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
          },
          paint: { "text-color": "#1c1914", "text-halo-color": "#f4efe4", "text-halo-width": 1.2 },
        },
        {
          id: "water-label", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 8,
          layout: {
            "text-field": ["coalesce", ["get", "name_en"], ["get", "name"], ""],
            "text-font": ["Noto Sans Italic"],
            "text-size": 12,
          },
          paint: { "text-color": "#1e4d6b", "text-halo-color": "#e7f2f8", "text-halo-width": 1 },
        },
        {
          id: "peak-label", type: "symbol", source: "openmaptiles", "source-layer": "mountain_peak", minzoom: 11,
          layout: {
            "text-field": ["concat", ["coalesce", ["get", "name_en"], ["get", "name"], ""], " ", ["case", ["has", "ele"], ["to-string", ["round", ["get", "ele"]]], ""]],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
          },
          paint: { "text-color": "#3f2a1c", "text-halo-color": "#f4efe4", "text-halo-width": 1 },
        },
      ],
    };
  }

  function empty() {
    return { type: "FeatureCollection", features: [] };
  }

  function wood(id, klass, color, opacity) {
    return {
      id: id, type: "fill", source: "openmaptiles", "source-layer": "landcover",
      filter: ["==", ["get", "class"], klass],
      paint: { "fill-color": color, "fill-opacity": opacity },
    };
  }

  function road(id, classes, color, width, minzoom) {
    return {
      id: id, type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: minzoom,
      filter: ["match", ["get", "class"], classes, true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], minzoom, 0.4 * width, 16, 7 * width],
      },
    };
  }

  function label(id, layer, classes, minzoom, size) {
    return {
      id: id, type: "symbol", source: "openmaptiles", "source-layer": layer, minzoom: minzoom,
      filter: ["match", ["get", "class"], classes, true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"], ""],
        "text-font": ["Noto Sans Regular"],
        "text-size": size,
      },
      paint: { "text-color": "#1c1914", "text-halo-color": "#f4efe4", "text-halo-width": 1.2 },
    };
  }

  var PAPER = ["land-wood", "land-grass", "land-wetland", "water", "waterway", "road-motorway-case", "road-major-case", "road-minor-case", "road-motorway", "road-major", "road-minor", "road-path", "rail", "rail-hatch", "runway", "building", "land-use", "place-major", "place-minor", "road-label", "water-label", "peak-label"];

  function show(map, id, on) {
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  function apply(map, state) {
    var paper = state.base === "paper";
    PAPER.forEach(function (id) {
      var on = paper;
      if (id === "land-wood" || id === "land-grass" || id === "land-wetland") on = paper && state.layers.woods;
      if (id === "water" || id === "waterway" || id === "water-label") on = paper && state.layers.water;
      if (id.indexOf("road-") === 0 && id !== "road-path") on = paper && state.layers.roads;
      if (id === "road-path") on = paper && state.layers.trails !== false;
      if (id === "rail" || id === "rail-hatch") on = paper && state.layers.rail;
      if (id === "runway") on = paper && state.layers.air !== false;
      if (id === "building") on = paper && state.layers.buildings;
      if (id === "land-use") on = paper && state.layers.land !== false;
      if (id === "peak-label") on = paper && state.layers.peaks;
      if (id === "place-major") on = true;
      if (id === "place-minor" || id === "road-label") on = paper && state.labels === "full" && state.layers.roads;
      if (id === "place-minor") on = paper && state.labels === "full";
      show(map, id, on);
    });
    show(map, "imagery", state.base === "imagery");
    show(map, "usgs", state.base === "usgs");
    var hillOn = state.hill !== "off";
    show(map, "hill-esri", hillOn && !state.offline);
    show(map, "hill-local", hillOn && !!state.offline);
    if (map.getLayer("hill-esri")) {
      map.setPaintProperty("hill-esri", "raster-opacity", state.hill === "sharp" ? 0.72 : 0.38);
    }
    show(map, "contours", state.contours !== "off");
    show(map, "grid-line", !!(state.layers.grid || state.secondary === "utm"));
    show(map, "graticule-line", state.secondary === "latlon");
    var canvas = map.getCanvas();
    canvas.style.filter = state.ink === "bw" ? "grayscale(1) contrast(1.12)" : "";
  }

  root.EXO = root.EXO || {};
  root.EXO.mapStyle = { build: build, apply: apply, empty: empty };
})(typeof globalThis !== "undefined" ? globalThis : this);
