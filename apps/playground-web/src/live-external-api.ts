/**
 * @gigalibs/playground-web - Live External Open API Connectors Hub
 * Real Zero-Auth Public APIs (No Registration Required)
 *
 * 1. 🐙 GitHub Public REST API (Commits, Stars, Releases)
 * 2. 🏛️ US Government Open Data (USGS Real-Time Earthquakes & Geo)
 * 3. 🛒 E-Commerce & Retail Catalog (Amazon/Retail SKUs, Pricing, Stock)
 * 4. 📰 HackerNews Social & Tech Discussions (Top Trending Stories)
 * 5. 🌤️ Open-Meteo & US National Weather Grid (Live California & NYC telemetry)
 * 6. 🪙 CoinGecko Global Financial & Crypto Stream (Real-Time Market Caps & Volatility)
 */

export interface LiveExternalFeedResult {
  source: 'GITHUB' | 'US_GOV_USGS' | 'ECOMMERCE_RETAIL' | 'HACKERNEWS' | 'WEATHER_METEO' | 'COINGECKO_FINANCE';
  title: string;
  endpoint: string;
  fetchedAt: string;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR';
  itemCount: number;
  data: any;
}

export class LiveExternalApiHub {
  // 1. 🐙 GITHUB PUBLIC REST API
  static async fetchGitHubReactCommits(repo = 'facebook/react'): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const endpoint = `https://api.github.com/repos/${repo}/commits?per_page=6`;
    try {
      const res = await fetch(endpoint);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
      const json = await res.json();
      const commits = (json as any[]).map((c) => ({
        sha: c.sha.slice(0, 7),
        fullSha: c.sha,
        author: c.commit?.author?.name || c.author?.login || 'Anonymous',
        authorAvatar: c.author?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        message: c.commit?.message?.split('\n')[0] || 'No message',
        date: c.commit?.author?.date || new Date().toISOString(),
        url: c.html_url,
      }));

      return {
        source: 'GITHUB',
        title: `GitHub Repository Commits (${repo})`,
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: commits.length,
        data: commits,
      };
    } catch (err: any) {
      return {
        source: 'GITHUB',
        title: `GitHub Commits (${repo})`,
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }

  // 2. 🏛️ US GOVERNMENT OPEN DATA (USGS Real-Time Earthquakes & Geo)
  static async fetchUsgsEarthquakes(): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const endpoint = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
    try {
      const res = await fetch(endpoint);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`USGS Open Data HTTP ${res.status}`);
      const json = await res.json();
      const features = (json.features || []).slice(0, 8).map((f: any) => ({
        id: f.id,
        place: f.properties.place,
        magnitude: f.properties.mag,
        time: new Date(f.properties.time).toLocaleTimeString(),
        tsunami: f.properties.tsunami === 1 ? 'YES' : 'NO',
        coordinates: {
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
          depthKm: f.geometry.coordinates[2],
        },
        url: f.properties.url,
      }));

      return {
        source: 'US_GOV_USGS',
        title: 'US Government USGS Real-Time Earthquakes Feed',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: features.length,
        data: features,
      };
    } catch (err: any) {
      return {
        source: 'US_GOV_USGS',
        title: 'US Government USGS Earthquake Feed',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }

  // 3. 🛒 E-COMMERCE & RETAIL (DummyJSON Open Store Catalog)
  static async fetchEcommerceCatalog(): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const endpoint = 'https://dummyjson.com/products?limit=8';
    try {
      const res = await fetch(endpoint);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`E-Commerce Catalog HTTP ${res.status}`);
      const json = await res.json();
      const products = (json.products || []).map((p: any) => ({
        id: p.id,
        sku: `SKU-EC-${p.id}`,
        title: p.title,
        category: p.category,
        price: p.price,
        discountPercentage: p.discountPercentage,
        rating: p.rating,
        stock: p.stock,
        brand: p.brand || 'Generic',
        thumbnail: p.thumbnail,
      }));

      return {
        source: 'ECOMMERCE_RETAIL',
        title: 'E-Commerce Global Catalog & Pricing Stream',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: products.length,
        data: products,
      };
    } catch (err: any) {
      return {
        source: 'ECOMMERCE_RETAIL',
        title: 'E-Commerce Product Catalog',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }

  // 4. 📰 HACKERNEWS LIVE TOP STORIES (Firebase Open REST API)
  static async fetchHackerNewsTop(): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const topIdsEndpoint = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    try {
      const idsRes = await fetch(topIdsEndpoint);
      if (!idsRes.ok) throw new Error(`HackerNews API HTTP ${idsRes.status}`);
      const ids = ((await idsRes.json()) as number[]).slice(0, 6);

      // Fetch top 6 items in parallel
      const storyPromises = ids.map(async (id) => {
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return itemRes.json();
      });

      const stories = await Promise.all(storyPromises);
      const latencyMs = Math.round(performance.now() - start);

      const formatted = stories.map((s: any) => ({
        id: s.id,
        title: s.title,
        by: s.by,
        score: s.score,
        commentsCount: s.descendants || 0,
        time: new Date(s.time * 1000).toLocaleTimeString(),
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
      }));

      return {
        source: 'HACKERNEWS',
        title: 'HackerNews Live Trending Tech Feed',
        endpoint: topIdsEndpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: formatted.length,
        data: formatted,
      };
    } catch (err: any) {
      return {
        source: 'HACKERNEWS',
        title: 'HackerNews Discussions',
        endpoint: topIdsEndpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }

  // 5. 🌤️ OPEN-METEO WEATHER TELEMETRY (Los Angeles Studio Soundstage Grid)
  static async fetchWeatherTelemetry(lat = 34.05, lon = -118.24): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,surface_pressure`;
    try {
      const res = await fetch(endpoint);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const json = await res.json();
      const current = json.current || {};

      const telemetry = {
        location: 'Paramount Studios (Los Angeles, CA)',
        latitude: lat,
        longitude: lon,
        temperatureC: current.temperature_2m,
        temperatureF: Math.round((current.temperature_2m * 9) / 5 + 32),
        humidityPercent: current.relative_humidity_2m,
        windSpeedKmh: current.wind_speed_10m,
        surfacePressureHpa: current.surface_pressure,
        apparentTempC: current.apparent_temperature,
      };

      return {
        source: 'WEATHER_METEO',
        title: 'US Weather & Soundstage Atmospheric Telemetry',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: 1,
        data: telemetry,
      };
    } catch (err: any) {
      return {
        source: 'WEATHER_METEO',
        title: 'Weather Telemetry',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }

  // 6. 🪙 COINGECKO CRYPTO & FINANCIAL MARKET STREAM
  static async fetchCryptoMarketPrices(): Promise<LiveExternalFeedResult> {
    const start = performance.now();
    const endpoint = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,cardano&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true';
    try {
      const res = await fetch(endpoint);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const json = await res.json();

      const coins = Object.entries(json).map(([id, val]: [string, any]) => ({
        asset: id.toUpperCase(),
        priceUsd: val.usd,
        change24hPercent: Number(val.usd_24h_change?.toFixed(2) || 0),
        volume24hUsd: Math.round(val.usd_24h_vol || 0),
      }));

      return {
        source: 'COINGECKO_FINANCE',
        title: 'Global Financial & Crypto Liquidity Stream',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs,
        status: 'SUCCESS',
        itemCount: coins.length,
        data: coins,
      };
    } catch (err: any) {
      return {
        source: 'COINGECKO_FINANCE',
        title: 'Global Crypto Stream',
        endpoint,
        fetchedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - start),
        status: 'ERROR',
        itemCount: 0,
        data: { error: err.message },
      };
    }
  }
}
