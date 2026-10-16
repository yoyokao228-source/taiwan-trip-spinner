/**
 * 實時探索服務 (Multi-Endpoint Live Discovery Service)
 */
window.overpassCache = {};
window.localJsonCache = {};

// 可用的實時 API 鏡像站點 (自動故障轉移)
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

/**
 * 實時連線抓取（優先連線各大 API 節點，探索最新店家）
 */
window.fetchOSMData = async function(city, district, onStatusUpdate) {
  const cacheKey = `${city}_${district}`;
  if (window.overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ 已自實時快取載入 [${city} ${district}] ${window.overpassCache[cacheKey].length} 筆最新點位`);
    return window.overpassCache[cacheKey];
  }

  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 6000 : 4000;

  if (onStatusUpdate) onStatusUpdate(false, `📡 正在連線地圖衛星網路，實時搜尋 [${city} ${district}] 最新地點...`);

  // 開放式語意查詢：抓取區域內所有具名的美食、景點、休閒與商業節點
  const query = `
    [out:json][timeout:8];
    (
      node["tourism"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["leisure"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["amenity"~"restaurant|cafe|fast_food|cinema|marketplace|pub|bar|ice_cream"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["shop"~"bakery|pastry|bookstore"]["name"](around:${searchRadius},${center[0]},${center[1]});
    );
    out body 80;
  `;

  // 自動輪詢多個鏡像站點
  for (const endpoint of LIVE_API_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const parsed = parseOverpassElements(data.elements, city, district);

        if (parsed.length > 0) {
          window.overpassCache[cacheKey] = parsed;
          if (onStatusUpdate) onStatusUpdate(true, `📡 線上實時探索成功！獲取 [${city} ${district}] ${parsed.length} 筆點位`);
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`[API Endpoint Warning] 站點 ${endpoint} 無回應，切換至備用節點...`);
    }
  }

  // 僅在完全斷網或 API 全部超時，才啟用後備 JSON
  console.warn(`[Network Notice] 實時連線逾時，切換至在地資料庫備援`);
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
      isLive: true, // 標記為實時線上記錄
      desc: tags.description || tags.note || `實時連線獲取之在地真實${type}`
    });
  });

  return results;
}
