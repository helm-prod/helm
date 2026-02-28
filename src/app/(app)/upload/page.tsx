import { PageGuard } from '@/components/page-guard'
import UploadPageClient from './upload-page-client'

export default function UploadPage() {
  return (
    <PageGuard pageSlug="upload">
      <UploadPageClient />
    </PageGuard>
  )
}
