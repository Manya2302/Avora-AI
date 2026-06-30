import { create } from 'zustand'
import { ChunkUploadProgress } from '@/types'

interface UploadState {
  queue: ChunkUploadProgress[]
  addToQueue: (item: ChunkUploadProgress) => void
  updateProgress: (documentId: string, updates: Partial<ChunkUploadProgress>) => void
  removeFromQueue: (documentId: string) => void
  clearQueue: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
  queue: [],
  addToQueue: (item) => set(s => ({ queue: [...s.queue, item] })),
  updateProgress: (documentId, updates) =>
    set(s => ({ queue: s.queue.map(q => q.documentId === documentId ? { ...q, ...updates } : q) })),
  removeFromQueue: (documentId) =>
    set(s => ({ queue: s.queue.filter(q => q.documentId !== documentId) })),
  clearQueue: () => set({ queue: [] }),
}))
