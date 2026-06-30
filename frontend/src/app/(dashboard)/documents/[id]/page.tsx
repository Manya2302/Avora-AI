import DocumentDetailPage from '@/components/documents/DocumentDetailPage'
export default function Page({ params }: { params: { id: string } }) {
  return <DocumentDetailPage id={params.id} />
}
