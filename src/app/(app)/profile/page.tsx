import { PageGuard } from '@/components/page-guard'
import ProfilePageClient from './profile-page-client'

export default function ProfilePage() {
  return (
    <PageGuard pageSlug="profile">
      <ProfilePageClient />
    </PageGuard>
  )
}
