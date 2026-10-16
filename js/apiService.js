/**
 * 實時探索服務 (方案 B：極致黑名單 + 質感店家標的連線)
 */
window.overpassCache = {};
window.localJsonCache = {};

const LIVE_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.eu/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

window.getQueryCenter = function(city, district) {
  const geoMap = window.districtGeoMap;
  if (!geoMap) return [25.0330, 121.5654];
  const cityInfo = geoMap[city];
  if (!cityInfo) return [25.0330, 121.5654];
  if (district !== "全區" && cityInfo.districts && cityInfo.districts[district]) {
    return cityInfo.districts[district];
  }
  return cityInfo.center;
};

function buildTargetedQuery(slot, searchRadius, lat, lng) {
  if (slot.isMeal) {
    return `(
      node["amenity"~"restaurant|fast_food|food_court"]["name"](around:${searchRadius},${lat},${lng});
    );`;
  } else if (slot.time && slot.time.includes("14:00")) {
    return `(
      node["amenity"="cafe"]["name"](around:${searchRadius},${lat},${lng});
      node["tourism"~"museum|gallery|attraction|arts_centre"]["name"](around:${searchRadius},${lat},${lng});
      node["shop"~"bakery|pastry|bookstore"]["name"](around:${searchRadius},${lat},${lng});
    );`;
  } else if (slot.time && slot.time.includes("20:00")) {
    return `(
      node["amenity"~"pub|bar|cinema"]["name"](around:${searchRadius},${lat},${lng});
      node["tourism"~"viewpoint|attraction"]["name"](around:${searchRadius},${lat},${lng});
      node["leisure"~"bowling_alley|sports_centre"]["name"](around:${searchRadius},${lat},${lng});
    );`;
  } else {
    return `(
      node["tourism"~"attraction|museum|viewpoint"]["name"](around:${searchRadius},${lat},${lng});
      node["leisure"~"park|sports_centre|garden"]["name"](around:${searchRadius},${lat},${lng});
    );`;
  }
}

async function fetchEndpointSlot(endpoint, queryBody, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fullQuery = `[out:json][timeout:6];${queryBody}out body 60;`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(fullQuery),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.elements || [];
  } catch (err) {
    clearTimeout(timeoutId);
    return [];
  }
}

window.fetchSlotDataLive = async function(city, district, slot, timeoutMs = 8000) {
  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 5000 : 3500;
  const queryBody = buildTargetedQuery(slot, searchRadius, center[0], center[1]);

  const tasks = LIVE_API_ENDPOINTS.map(endpoint => fetchEndpointSlot(endpoint, queryBody, timeoutMs));

  const results = await Promise.allSettled(tasks);
  let elements = [];

  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      elements.push(...res.value);
    }
  });

  return parseOverpassElements(elements, city, district);
};

window.loadCityJsonFallback = async function(cityName) {
  if (window.localJsonCache[cityName]) return window.localJsonCache[cityName];
  const encodedCity = encodeURIComponent(cityName);
  const possiblePaths = [`data/${encodedCity}.json`, `${encodedCity}.json`];

  for (const path of possiblePaths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          window.localJsonCache[cityName] = data.map(d => ({ ...d, isLive: false }));
          return window.localJsonCache[cityName];
        }
      }
    } catch (e) {}
  }
  return [];
};

function parseOverpassElements(elements, city, district) {
  if (!elements || !Array.isArray(elements)) return [];
  const results = [];
  const seenNames = new Set();

  elements.forEach(el => {
    const tags = el.tags || {};
    const name = tags['name:zh-Hant'] || tags['name:zh'] || tags['name'];
    if (!name || name.length < 2 || seenNames.has(name)) return;
    seenNames.add(name);

    let category = "文青靜態";
    let type = "景點";

    if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food' || tags.amenity === 'food_court') {
      type = "美食";
      category = "美食放鬆";
    } else if (tags.amenity === 'cafe') {
      type = "景點";
      category = "文青靜態";
    } else if (tags.leisure === 'park' || tags.tourism === 'viewpoint') {
      type = "景點";
      category = "戶外自然";
    }

    results.push({
      id: el.id,
      name: name,
      city: city,
      district: tags['addr:district'] || (district === "全區" ? "觀光區域" : district),
      type: type,
      category: category,
      amenity: tags.amenity,
      avgCost: type === "美食" ? 220 : 150,
      lat: el.lat,
      lng: el.lon,
      isLive: true,
      desc: tags.description || tags.note || ""
    });
  });

  return results;
}
