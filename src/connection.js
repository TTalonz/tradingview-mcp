import CDP from 'chrome-remote-interface';

let client = null;
let targetInfo = null;
const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const MAX_RETRIES = 5;
const BASE_DELAY = 500;

// Known direct API paths discovered via live probing (see PROBE_RESULTS.md)
const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()',
  // Phase 1: Strategy data — model().dataSources() → find strategy → .performance().value(), .ordersData(), .reportData()
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  // Phase 2: Layouts — getSavedCharts(cb), loadChartFromServer(id)
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  // Phase 5: Symbol search — searchSymbols(query) returns Promise
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  // Phase 6: Pine scripts — REST API at pine-facade.tradingview.com/pine-facade/list/?filter=saved
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

export { KNOWN_PATHS };

/**
 * Sanitize a string for safe interpolation into JavaScript code evaluated via CDP.
 * Uses JSON.stringify to produce a properly escaped JS string literal (with quotes).
 * Prevents injection via quotes, backticks, template literals, or control chars.
 */
export function safeString(str) {
  return JSON.stringify(String(str));
}

/**
 * Validate that a value is a finite number. Throws if NaN, Infinity, or non-numeric.
 * Prevents corrupt values from reaching TradingView APIs that persist to cloud state.
 */
export function requireFinite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number, got: ${value}`);
  return n;
}

export async function getClient() {
  if (client) {
    try {
      // Quick liveness check
      await client.Runtime.evaluate({ expression: '1', returnByValue: true });

      // Active-chart recheck: read active symbols from ALL container windows and compare
      // to the cached target's symbol. Reconnect if the user has switched charts.
      const containerSymbols = await getAllContainerActiveSymbols();
      if (containerSymbols.size > 0) {
        const res = await client.Runtime.evaluate({
          expression: `(function(){try{return window.TradingViewApi._activeChartWidgetWV.value().symbol();}catch(e){return null;}})()`,
          returnByValue: true,
        });
        const cached = res.result?.value;
        const cachedTicker = cached?.includes(':') ? cached.split(':').pop() : cached;

        const cachedPresent = cached && (containerSymbols.has(cached) || containerSymbols.has(cachedTicker));
        const nonCached = [...containerSymbols].filter(s => s !== cached && s !== cachedTicker);

        // Rule 3: cached symbol gone from all containers — reconnect
        // Rule 4: exactly one new symbol appeared — reconnect directly to it
        if (!cachedPresent || nonCached.length === 1) {
          try { await client.close(); } catch {}
          client = null;
          targetInfo = null;
          return connect(nonCached.length === 1 ? nonCached[0] : null);
        }
      }

      return client;
    } catch {
      client = null;
      targetInfo = null;
    }
  }
  return connect();
}

// Returns a Set of bare tickers (e.g. {"DXY","ARBUSDT"}) from all container windows.
async function getAllContainerActiveSymbols() {
  const symbols = new Set();
  try {
    const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
    const targets = await resp.json();
    const containers = targets.filter(t => t.type === 'page' && /tabbed-window/i.test(t.url));
    for (const ct of containers) {
      const sym = await probeEval(ct.id, `document.querySelector('.tab.active .symbol')?.textContent?.trim()`);
      if (sym) symbols.add(sym);
    }
  } catch { /* non-fatal — return whatever was collected */ }
  return symbols;
}

export async function connect(preferredSymbol = null) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const target = await findChartTarget(preferredSymbol);
      if (!target) {
        throw new Error('No TradingView chart target found. Is TradingView open with a chart?');
      }
      targetInfo = target;
      client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });

      // Enable required domains
      await client.Runtime.enable();
      await client.Page.enable();
      await client.DOM.enable();

      return client;
    } catch (err) {
      lastError = err;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function probeEval(targetId, expression) {
  let probe;
  try {
    probe = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
    await probe.Runtime.enable();
    const result = await probe.Runtime.evaluate({ expression, returnByValue: true });
    await probe.close();
    return result.result?.value ?? null;
  } catch {
    try { await probe?.close(); } catch {}
    return null;
  }
}

async function findChartTarget(preferredSymbol = null) {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();

  const chartTargets = targets.filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url));
  if (chartTargets.length === 0) {
    return targets.find(t => t.type === 'page' && /tradingview/i.test(t.url)) || null;
  }
  if (chartTargets.length === 1) return chartTargets[0];

  // Fast path: caller already knows the preferred ticker — scan for it directly.
  if (preferredSymbol) {
    for (const target of chartTargets) {
      const sym = await probeEval(
        target.id,
        `(function(){try{return window.TradingViewApi._activeChartWidgetWV.value().symbol();}catch(e){return null;}})()`
      );
      if (!sym) continue;
      const ticker = sym.includes(':') ? sym.split(':').pop() : sym;
      if (ticker === preferredSymbol || sym === preferredSymbol) return target;
    }
  }

  // Step 1: read active tab symbol from all tabbed-window containers.
  const containerTargets = targets.filter(t => t.type === 'page' && /tabbed-window/i.test(t.url));
  const activeSymbols = new Set();
  for (const ct of containerTargets) {
    const sym = await probeEval(ct.id, `document.querySelector('.tab.active .symbol')?.textContent?.trim()`);
    if (sym) activeSymbols.add(sym);
  }

  // Step 2: find the chart target whose active symbol matches a container active symbol.
  if (activeSymbols.size > 0) {
    for (const target of chartTargets) {
      const sym = await probeEval(
        target.id,
        `(function(){try{return window.TradingViewApi._activeChartWidgetWV.value().symbol();}catch(e){return null;}})()`
      );
      if (!sym) continue;
      const ticker = sym.includes(':') ? sym.split(':').pop() : sym;
      if (activeSymbols.has(ticker) || activeSymbols.has(sym)) return target;
    }
  }

  // Fallback: prefer the chart target whose page has OS focus.
  for (const target of chartTargets) {
    const focused = await probeEval(target.id, 'document.hasFocus()');
    if (focused === true) return target;
  }

  return chartTargets[0]; // last-resort fallback
}

/**
 * Disconnect the cached client and reconnect directly to a specific CDP target ID.
 * Used by tab_switch so subsequent tool calls read from the correct tab.
 */
export async function connectToTarget(targetId) {
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    targetInfo = null;
  }

  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  const target = targets.find(t => t.id === targetId);
  if (!target) throw new Error(`CDP target ${targetId} not found`);

  targetInfo = target;
  client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
  await client.Runtime.enable();
  await client.Page.enable();
  await client.DOM.enable();
  return client;
}

export async function getTargetInfo() {
  if (!targetInfo) {
    await getClient();
  }
  return targetInfo;
}

export async function evaluate(expression, opts = {}) {
  const c = await getClient();
  const result = await c.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: opts.awaitPromise ?? false,
    ...opts,
  });
  if (result.exceptionDetails) {
    const msg = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Unknown evaluation error';
    throw new Error(`JS evaluation error: ${msg}`);
  }
  return result.result?.value;
}

export async function evaluateAsync(expression) {
  return evaluate(expression, { awaitPromise: true });
}

export async function disconnect() {
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    targetInfo = null;
  }
}

// --- Direct API path helpers ---
// Each returns the STRING expression path after verifying it exists.
// Callers use the returned string in their own evaluate() calls.

async function verifyAndReturn(path, name) {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`);
  if (!exists) {
    throw new Error(`${name} not available at ${path}`);
  }
  return path;
}

export async function getChartApi() {
  return verifyAndReturn(KNOWN_PATHS.chartApi, 'Chart API');
}

export async function getChartCollection() {
  return verifyAndReturn(KNOWN_PATHS.chartWidgetCollection, 'Chart Widget Collection');
}

export async function getBottomBar() {
  return verifyAndReturn(KNOWN_PATHS.bottomWidgetBar, 'Bottom Widget Bar');
}

export async function getReplayApi() {
  return verifyAndReturn(KNOWN_PATHS.replayApi, 'Replay API');
}

export async function getMainSeriesBars() {
  return verifyAndReturn(KNOWN_PATHS.mainSeriesBars, 'Main Series Bars');
}
