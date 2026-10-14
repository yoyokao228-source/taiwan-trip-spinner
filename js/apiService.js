/**
 * Overpass API 實時資料抓取服務 (API Service with Abort Controller & Caching)
 */
const overpassCache = {};

/**
 * 取得指定縣市與鄉鎮區之精確中心座標
 */
function getQueryCenter(city, district) {
  if (typeof districtGeoMap === 'undefined') return [25.0330, 121.5654];
  const cityInfo = districtGeoMap[city];
  if (!cityInfo) return [25.0330, 121.5654];
  if (district !== "全區" && cityInfo.districts && cityInfo.districts[district]) {
    return cityInfo.districts[district];
  }
  return cityInfo.center;
}

/**
 * 發送 Overpass API 查詢實時 OSM 景點與美食
 */
async function fetchOSMData(city, district, onStatusUpdate) {
  const cacheKey = `${city}_${district}`;
  if (overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 已自快取獲取 ${overpassCache[cacheKey].length} 筆地點`);
    return overpassCache[cacheKey];
  }

  const center = getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 5000 : 3500;

  if (onStatusUpdate) onStatusUpdate(false, `正在讀取 [${city} ${district}] 最新地點...`);

  // 輕量化 QL 語法：僅檢索 Node 節點並限制輸出數量
  const query = `
    [out:json][timeout:6];
    (
      node["tourism"~"museum|attraction|gallery|viewpoint|theme_park"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["leisure"~"park|sports_centre|bowling_alley"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["amenity"~"restaurant|cafe|fast_food|cinema|place_of_worship|marketplace"]["name"](around:${searchRadius},${center[0]},${center[1]});
    );
    out body 40;
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒超時熔斷

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("API Network Error");
    const data = await res.json();
    const parsed = parseOverpassElements(data.elements, city, district);

    overpassCache[cacheKey] = parsed;
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 獲取 ${parsed.length} 筆實時地點`);
    return parsed;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[${city} ${district}] API 響應逾時或失敗，啟用同縣市備援`);
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] API 逾時，已準備備援資料`);
    return [];
  }
}

/**
 * 解析並規格化 OSM 回傳節點
 */
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
    let nightOnly = false;
    let mondayOff = false;

    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food') {
      type = "美食";
      category = "美食放鬆";
      isGym = true;
    } else if (tags.leisure === 'park' || tags.tourism === 'viewpoint') {
      type = "景點";
      category = "戶外自然";
      isIndoor = false;
      isGym = true;
      if (name.includes("夜市") || name.includes("夜景")) nightOnly = true;
    } else if (tags.leisure === 'sports_centre' || tags.leisure === 'bowling_alley') {
      type = "景點";
      category = "運動休閒";
      isGym = true;
    } else if (tags.tourism === 'museum' || name.includes("博物館") || name.includes("美術館")) {
      type = "景點";
      category = "文青靜態";
      mondayOff = true;
    }

    results.push({
      id: el.id,
      name: name,
      city: city,
      district: district === "全區" ? "觀光區域" : district,
      type: type,
      category: category,
      isIndoor: isIndoor,
      isGymFriendly: isGym,
      nightOnly: nightOnly,
      mondayOff: mondayOff,
      avgCost: type === "美食" ? 220 : 150,
      lat: el.lat,
      lng: el.lon,
      desc: `實時動態核實地點 (${category})`
    });
  });

  return results;
}
