import { PageGuard } from '@/components/page-guard'
import NewSopPageClient from './new-sop-page-client'

export default function NewSopPage() {
  return (
    <PageGuard pageSlug="sops">
      <NewSopPageClient />
    </PageGuard>
  )
}
