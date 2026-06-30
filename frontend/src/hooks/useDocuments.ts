'use client'
import { useState, useEffect, useCallback } from 'react'
import { documentsApi } from '@/lib/api'
import { Document, PaginatedResponse } from '@/types'

export function useDocuments(params?: Record<string, unknown>) {
  const [data, setData]       = useState<PaginatedResponse<Document> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await documentsApi.list(params)
      setData(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(params)])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

export function useDocument(id: string) {
  const [doc, setDoc]         = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    documentsApi.get(id)
      .then(r => setDoc(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Not found'))
      .finally(() => setLoading(false))
  }, [id])

  return { doc, loading, error }
}
