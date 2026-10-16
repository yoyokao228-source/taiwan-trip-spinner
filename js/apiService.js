/**
 * 實時探索服務 (極速並行競速版 - Promise.any Parallel Discovery)
 */
window.overpassCache = {};
window.localJsonCache = {};

// 3 個完全獨立域名的實時 API 鏡像站
const LIVE_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
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

// 單一站點請求 (包含熔斷控制)
async function fetchSingleEndpoint(url, query, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(url, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
  const data = await res.json();
  if (!data.elements || data.elements.length === 0) throw new Error("Empty Elements");
  return data.elements;
}

/**
 * 並行競速發送：同時向 3 個鏡像站發起請求，取最快回傳者
 */
window.fetchOSMData = async function(city, district, onStatusUpdate) {
  const cacheKey = `${city}_${district}`;
  if (window.overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 載入快取 (${window.overpassCache[cacheKey].length} 筆)`);
    return window.overpassCache[cacheKey];
  }

  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 6000 : 4000;

  if (onStatusUpdate) onStatusUpdate(false, `📡 多節點並行連線中，實時搜尋 [${city} ${district}] 最新地點...`);

  const query = `
    [out:json][timeout:5];
    (
      node["tourism"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["leisure"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["amenity"~"restaurant|cafe|fast_food|cinema|marketplace|pub|bar|ice_cream"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["shop"~"bakery|pastry|bookstore"]["name"](around:${searchRadius},${center[0]},${center[1]});
    );
    out body 80;
  `;

  try {
    // 🔥 Promise.any: 同時發送 3 個請求，只要「最快成功的那一台」回應，立刻 return！
    const rawElements = await Promise.any(
      LIVE_API_ENDPOINTS.map(url => fetchSingleEndpoint(url, query, 4000))
    );

    const parsed = parseOverpassElements(rawElements, city, district);
    if (parsed.length > 0) {
      window.overpassCache[cacheKey] = parsed;
      if (onStatusUpdate) onStatusUpdate(true, `📡 極速連線成功！獲取 [${city} ${district}] ${parsed.length} 筆最新點位`);
      return parsed;
    }
    throw new Error("無有效解析點位");
  } catch (err) {
    // 只有當 3 個節點都超時或報錯時，才會進到備援離線 JSON
    console.warn(`[並行連線失敗/全部超時]，秒切在地備援資料庫...`);
    const fallbackList = await window.loadCityJsonFallback(city);
    if (onStatusUpdate) onStatusUpdate(true, `💾 已連接在地備援庫 (${fallbackList.length} 筆)`);
    return fallbackList;
  }
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
