/**
 * 實時探索服務 (6 節點 x 2 雙請求 = 12 並行極速連線)
 */
window.overpassCache = {};
window.localJsonCache = {};

// 6 大國際獨立 API 節點
const LIVE_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.eu/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

// 每個節點發出 2 個精準專用請求 (避免包山包海導致 504 Timeout)
const SUB_QUERIES = [
  // 請求 1：觀光景點、休閒公園、藝文設施
  (r, lat, lng) => `(
    node["tourism"~"attraction|museum|viewpoint|gallery"]["name"](around:${r},${lat},${lng});
    node["leisure"~"park|sports_centre|bowling_alley"]["name"](around:${r},${lat},${lng});
  );`,
  // 請求 2：美食餐廳、特色咖啡、地方店家
  (r, lat, lng) => `(
    node["amenity"~"restaurant|cafe|fast_food|ice_cream|marketplace|pub|bar"]["name"](around:${r},${lat},${lng});
    node["shop"~"bakery|pastry|bookstore"]["name"](around:${r},${lat},${lng});
  );`
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

// 單一專屬請求 (可設定獨立熔斷時間)
async function fetchSubQuery(endpoint, subQueryBody, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fullQuery = `[out:json][timeout:8];${subQueryBody}out body 60;`;

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

/**
 * 實時數據抓取
 * @param {boolean} isPreload 是否為切換縣市預載 (true: 無限制等待; false: 10秒極限熔斷)
 */
window.fetchOSMData = async function(city, district, onStatusUpdate, isPreload = false) {
  const cacheKey = `${city}_${district}`;
  if (window.overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 已自快取的 ${window.overpassCache[cacheKey].length} 筆點位加載`);
    return window.overpassCache[cacheKey];
  }

  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 6000 : 4000;

  // 1. 熔斷時間區分：預載模式放寬至 60 秒；手動生成模式給予 10 秒
  const timeoutMs = isPreload ? 60000 : 10000;

  if (onStatusUpdate) {
    const modeText = isPreload ? "深度靜默探測中 (不設限等待)..." : "12連線發射中 (10秒實時衝刺)...";
    onStatusUpdate(false, `📡 正在對 [${city} ${district}] 發起全網連線，${modeText}`);
  }

  // 2. 構建 6 節點 x 2 請求 = 12 個並行通道
  const tasks = [];
  LIVE_API_ENDPOINTS.forEach(endpoint => {
    SUB_QUERIES.forEach(tmpl => {
      tasks.push(fetchSubQuery(endpoint, tmpl(searchRadius, center[0], center[1]), timeoutMs));
    });
  });

  // 3. 12 通道發射，收集所有順利返回的實時地點
  const results = await Promise.allSettled(tasks);
  let liveElements = [];

  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      liveElements.push(...res.value);
    }
  });

  const parsed = parseOverpassElements(liveElements, city, district);

  if (parsed.length > 0) {
    window.overpassCache[cacheKey] = parsed;
    if (onStatusUpdate) onStatusUpdate(true, `📡 線上實時探索成功！獲得 [${city} ${district}] ${parsed.length} 筆最新點位`);
    return parsed;
  }

  console.warn(`[實時 12 通道無資料或超時] 切換離線備援庫...`);
  return [];
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
      desc: tags.description || tags.note || `實時線上發現之在地真實${type}`
    });
  });

  return results;
}
