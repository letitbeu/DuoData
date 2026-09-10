import { NextResponse } from 'next/server'
import { getSnapshot } from '@/lib/market'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const data = await getSnapshot()
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
