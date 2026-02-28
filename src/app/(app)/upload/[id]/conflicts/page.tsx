import { PageGuard } from '@/components/page-guard'
import ConflictsPageClient from './conflicts-page-client'

export default function ConflictsPage() {
  return (
    <PageGuard pageSlug="upload">
      <ConflictsPageClient />
    </PageGuard>
  )
}
