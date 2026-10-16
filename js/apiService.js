/**
 * 實時探索服務 (30+ 矩陣競速引擎 - Matrix Parallel Discovery Engine)
 */
window.overpassCache = {};
window.localJsonCache = {};

// 6 大國際獨立連線節點
const LIVE_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.eu/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

// 5 大輕量語意主題拆分 (提高伺服器算力響應速度)
const SUB_QUERY_TEMPLATES = [
  (r, lat, lng) => `node["amenity"~"restaurant|fast_food"]["name"](around:${r},${lat},${lng});`,
  (r, lat, lng) => `node["amenity"~"cafe|pub|bar|marketplace|ice_cream"]["name"](around:${r},${lat},${lng});`,
  (r, lat, lng) => `node["tourism"~"attraction|museum|viewpoint|gallery"]["name"](around:${r},${lat},${lng});`,
  (r, lat, lng) => `node["leisure"~"park|sports_centre|bowling_alley"]["name"](around:${r},${lat},${lng});`,
  (r, lat, lng) => `node["shop"~"bakery|pastry|bookstore"]["name"](around:${r},${lat},${lng});`
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

// 單一極輕量請求 (3.5 秒秒殺熔斷)
async function fetchLightweightQuery(endpoint, subQueryBody) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  const fullQuery = `[out:json][timeout:4];(${subQueryBody});out body 40;`;

  const res = await fetch(endpoint, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(fullQuery),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error("HTTP Error");
  const data = await res.json();
  return data.elements || [];
}

/**
 * 30+ 矩陣式並行連線抓取
 */
window.fetchOSMData = async function(city, district, onStatusUpdate) {
  const cacheKey = `${city}_${district}`;
  if (window.overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 載入快取 (${window.overpassCache[cacheKey].length} 筆)`);
    return window.overpassCache[cacheKey];
  }

  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 6000 : 4000;

  if (onStatusUpdate) onStatusUpdate(false, `⚡ 啟動 30+ 多管道極速並行掃瞄 [${city} ${district}]...`);

  // 構建 6 節點 x 5 主題 = 30 個並行 Fetch Tasks
  const parallelTasks = [];
  LIVE_API_ENDPOINTS.forEach(endpoint => {
    SUB_QUERY_TEMPLATES.forEach(tmpl => {
      const subQueryBody = tmpl(searchRadius, center[0], center[1]);
      parallelTasks.push(fetchLightweightQuery(endpoint, subQueryBody));
    });
  });

  // 發射 30+ 並行連線，收集所有成功返回的結果
  const results = await Promise.allSettled(parallelTasks);
  let liveElements = [];

  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      liveElements.push(...res.value);
    }
  });

  const parsed = parseOverpassElements(liveElements, city, district);

  if (parsed.length > 0) {
    window.overpassCache[cacheKey] = parsed;
    if (onStatusUpdate) onStatusUpdate(true, `📡 矩陣連線成功！獲得 [${city} ${district}] ${parsed.length} 筆實時點位`);
    return parsed;
  }

  console.warn(`[30+ 管道併發失敗] 切換至在地備援資料庫...`);
  const fallbackList = await window.loadCityJsonFallback(city);
  if (onStatusUpdate) onStatusUpdate(true, `💾 已連接在地備援庫 (${fallbackList.length} 筆)`);
  return fallbackList;
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
    let isIndoor = true;
    let isGym = false;

    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food' || tags.amenity === 'ice_cream') {
      type = "美食";
      category = "美食放鬆";
      isGym = true;
    } else if (tags.leisure === 'park' || tags.tourism === 'viewpoint') {
      type = "景點";
      category = "戶外自然";
      isIndoor = false;
      isGym = true;
    } else if (tags.leisure === 'sports_centre' || tags.leisure === 'bowling_alley') {
      type = "景點";
      category = "運動休閒";
      isGym = true;
    }

    results.push({
      id: el.id,
      name: name,
      city: city,
      district: tags['addr:district'] || (district === "全區" ? "觀光區域" : district),
      type: type,
      category: category,
      isIndoor: isIndoor,
      isGymFriendly: isGym,
      avgCost: type === "美食" ? 220 : 100,
      lat: el.lat,
      lng: el.lon,
      isLive: true,
      desc: tags.description || tags.note || `實時線上獲取之在地真實${type}`
    });
  });

  return results;
}
