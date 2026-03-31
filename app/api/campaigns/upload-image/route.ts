import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const campaignId = formData.get('campaignId') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 400 })
  }

  const prefix = campaignId ? `campaign-images/${campaignId}` : 'campaign-images/draft'
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  try {
    const blob = await put(`${prefix}/${filename}`, file, {
      access: 'public',
      contentType: file.type,
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
    })
  } catch (err) {
    console.error('Campaign image upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
