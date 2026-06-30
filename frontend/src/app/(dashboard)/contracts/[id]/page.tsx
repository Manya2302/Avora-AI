import ContractDetailPage from '@/components/contracts/ContractDetailPage'
export default function Page({ params }: { params: { id: string } }) { return <ContractDetailPage id={params.id}/> }
