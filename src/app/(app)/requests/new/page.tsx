import { PageGuard } from '@/components/page-guard'
import NewRequestPageClient from './new-request-page-client'

export default function NewRequestPage() {
  return (
    <PageGuard pageSlug="requests">
      <NewRequestPageClient />
    </PageGuard>
  )
}
