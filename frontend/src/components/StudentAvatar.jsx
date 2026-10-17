import { useState } from 'react'

export default function StudentAvatar({ student, className }) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState('')
  const initials = student?.full_name?.trim().charAt(0).toUpperCase()
  const showPhoto = student?.photo_url && student.photo_url !== failedPhotoUrl

  return (
    <span className={className}>
      {showPhoto
        ? <img className="student-avatar-image" src={student.photo_url} alt="" onError={() => setFailedPhotoUrl(student.photo_url)} />
        : initials}
    </span>
  )
}