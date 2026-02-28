import { PageGuard } from '@/components/page-guard'
import AdminPageClient from './admin-page-client'

export default function AdminPage() {
  return (
    <PageGuard pageSlug="admin">
      <AdminPageClient />
    </PageGuard>
  )
}
