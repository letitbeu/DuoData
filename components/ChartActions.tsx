'use client'

import { useState } from 'react'
import { toPng } from 'html-to-image'

type CsvValue=string|number|boolean|null|undefined
type CsvRow=Record<string,CsvValue>

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

function downloadBlob(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download=filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function csvEscape(v:CsvValue){
  if(v===null||v===undefined)return ''
  const s=String(v)
  return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s
}

export default function ChartActions({chartId,title,data}:{chartId:string;title:string;data:CsvRow[]}){
  const [copied,setCopied]=useState(false)
  const [busy,setBusy]=useState(false)

  async function downloadPng(){
    const node=document.getElementById(chartId)
    if(!node||busy)return
    setBusy(true)
    try{
      const dataUrl=await toPng(node,{
        cacheBust:true,
        pixelRatio:2,
        backgroundColor:'#ffffff',
        filter:(domNode)=>{
          const el=domNode as HTMLElement
          return el?.dataset?.exportExclude!=='true'
        },
      })
      const a=document.createElement('a')
      a.href=dataUrl
      a.download=`${slug(title)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    }finally{
      setBusy(false)
    }
  }

  function downloadCsv(){
    if(!data?.length)return
    const headers=Array.from(data.reduce((set,row)=>{
      Object.keys(row).forEach(k=>set.add(k))
      return set
    },new Set<string>()))
    const body=[
      headers.join(','),
      ...data.map(row=>headers.map(h=>csvEscape(row[h])).join(',')),
    ].join('\n')
    downloadBlob(new Blob(['\uFEFF',body],{type:'text/csv;charset=utf-8'}),`${slug(title)}.csv`)
  }

  async function copyLink(){
    const url=`${window.location.origin}${window.location.pathname}#${chartId}`
    try{
      await navigator.clipboard.writeText(url)
    }catch{
      const ta=document.createElement('textarea')
      ta.value=url
      ta.style.position='fixed'
      ta.style.opacity='0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(()=>setCopied(false),1600)
  }

  return <div className="chartExportControls" data-export-exclude="true" aria-label={`${title} export actions`}>
    <button type="button" onClick={downloadPng} disabled={busy}>{busy?'Rendering…':'PNG'}</button>
    <button type="button" onClick={downloadCsv} disabled={!data?.length}>CSV</button>
    <button type="button" onClick={copyLink}>{copied?'Copied':'Link'}</button>
  </div>
}
