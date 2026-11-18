import toast from 'react-hot-toast'
import { documentsApi } from '@/lib/api'

/** Hand a Blob to the browser as a file download. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Read the `error`/`detail` message out of an axios error whose body was requested as a Blob. */
export async function blobErrorMessage(e: any, fallback: string): Promise<string> {
  const data = e?.response?.data
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text())
      return parsed?.error || parsed?.detail || fallback
    }
    return data?.error || data?.detail || fallback
  } catch {
    return fallback
  }
}

/** Fetch the decrypted original from the API and save it under its original name. */
export async function downloadDocument(id: string, fileName: string) {
  const t = toast.loading(`Preparing ${fileName}…`)
  try {
    const res = await documentsApi.download(id)
    saveBlob(res.data as Blob, fileName)
    toast.success('Download started.', { id: t })
  } catch (e) {
    toast.error(await blobErrorMessage(e, 'The download failed. Please try again.'), { id: t })
  }
}
