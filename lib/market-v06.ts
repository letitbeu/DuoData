import {
  getSnapshot as getBaseSnapshot,
  type MarketRow as BaseMarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot as BaseSnapshot,
} from './market-v05'

export type ProductLayer = 'Real Equity' | 'Tokenized Spot' | 'TradFi Perps' | 'CFD / Broker'

export type MarketRow = BaseMarketRow & {
  productLayer: ProductLayer | null
  assetClass: string
}

export type Snapshot = Omit<BaseSnapshot, 'markets' | 'coverage'> & {
  markets: MarketRow[]
  coverage: CoverageRow[]
}

function classifyProductLayer(row: BaseMarketRow): ProductLayer | null {
  const product = String(row.product || '').toLowerCase()

  if (product.includes('stock+') || product.includes('real equity') || product.includes('real stock')) {
    return 'Real Equity'
  }

  if (
    product.includes('xstock token') ||
    product.includes('bstock') ||
    product.includes('rtoken') ||
    (product.includes('token') && !product.includes('perpetual') && !product.includes('future'))
  ) {
    return 'Tokenized Spot'
  }

  if (
    product.includes('perpetual') ||
    product.includes('future') ||
    product.includes('x-perp')
  ) {
    return 'TradFi Perps'
  }

  if (product.includes('cfd') || product.includes('mt5') || product.includes('broker')) {
    return 'CFD / Broker'
  }

  return null
}

function normalizeAssetClass(row: BaseMarketRow): string {
  const klass = String(row.marketClass || '').toLowerCase()
  const product = String(row.product || '').toLowerCase()

  if (klass.includes('pre-ipo') || klass.includes('pre-market') || product.includes('pre-ipo')) return 'Pre-IPO / Private'
  if (klass.includes('commodity etf')) return 'Commodity ETF'
  if (klass.includes('equity etf') || klass === 'etf' || klass.includes('etf / index')) return 'ETF'
  if (klass.includes('equity index')) return 'Equity Index'
  if (klass.includes('commodity index')) return 'Commodity Index'
  if (klass.includes('commodity') || klass.includes('gold')) return 'Commodity'
  if (klass === 'fx' || klass.includes('forex')) return 'FX'
  if (klass.includes('bond')) return 'Bond'
  if (klass.includes('equity')) return 'Equity'
  if (klass.includes('tokenized equity')) return 'Equity'
  if (klass === 'rwa') return 'RWA (unclassified)'
  return row.marketClass || 'Unclassified'
}

function productLayerCoverage(base: CoverageRow[]): CoverageRow[] {
  const retained = base.filter(c => !c.metric.startsWith('Product layer:'))
  return [
    {
      metric: 'Product layer: TradFi Perps',
      status: 'LIVE' as const,
      source: 'Binance + Bybit + Bitget + OKX + Coinbase INTX + Kraken public market APIs',
      note: 'Perpetual/futures products are aggregated only within this layer. Equity, ETF, index, commodity, FX, bond and pre-IPO are second-level asset classes.',
    },
    {
      metric: 'Product layer: Tokenized Spot',
      status: 'PARTIAL' as const,
      source: 'Bybit xStocks public market API; additional tokenized-stock venues pending',
      note: 'Tokenized spot turnover is kept separate from perpetual turnover. No derivative volume is included in this layer.',
    },
    {
      metric: 'Product layer: Real Equity',
      status: 'PRIVATE' as const,
      source: 'Exchange/broker customer trading data',
      note: 'Underlying stock quotes are public on some platforms, but venue customer stock turnover is not treated as public unless explicitly reported by the broker/exchange.',
    },
    {
      metric: 'Product layer: CFD / Broker',
      status: 'UNAVAILABLE' as const,
      source: 'Bybit TradFi CFD / MT5 and similar broker products',
      note: 'Public, venue-specific customer turnover has not yet been validated. DuoData does not mix CFD/MT5 activity into perpetual volumes.',
    },
    ...retained,
  ]
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  const markets: MarketRow[] = base.markets.map(row => ({
    ...row,
    productLayer: classifyProductLayer(row),
    assetClass: normalizeAssetClass(row),
  }))

  return {
    ...base,
    markets,
    coverage: productLayerCoverage(base.coverage),
  }
}

export type { VenueRow, CoverageRow }
