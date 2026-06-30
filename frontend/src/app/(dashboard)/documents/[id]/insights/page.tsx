import DocumentInsightsPage from '@/components/ai/DocumentInsightsPage'
export default function Page({ params }: { params: { id: string } }) {
  return <DocumentInsightsPage documentId={params.id} />
}
