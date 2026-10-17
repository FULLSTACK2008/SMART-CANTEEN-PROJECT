import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { useAuth } from '../context/auth.js'
import api from '../lib/api.js'

const emptyForm = {
  student_number: '',
  full_name: '',
  class: '',
  guardian_name: '',
  guardian_phone: '',
  daily_limit: '',
  notes: '',
}

function requestError(error, t) {
  return Object.values(error.response?.data?.errors || {})[0]?.[0]
    || t(error.response?.data?.message || 'The student record could not be saved.')
}

export default function StudentFormModal({ student, onClose, onSaved }) {
  const { user, t } = useAuth()
  const [form, setForm] = useState(() => student ? {
    student_number: student.student_number || '',
    full_name: student.full_name || '',
    class: student.class || '',
    guardian_name: student.guardian_name || '',
    guardian_phone: student.guardian_phone || '',
    daily_limit: student.daily_limit ?? '',
    notes: student.notes || '',
  } : emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(student?.photo_url || '')
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const cameraStream = useRef(null)
  const cameraRequestId = useRef(0)
  const videoRef = useRef(null)
  const editing = Boolean(student)

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  useEffect(() => () => {
    cameraRequestId.current += 1
    cameraStream.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !cameraStream.current) return
    videoRef.current.srcObject = cameraStream.current
    videoRef.current.play().catch(() => setCameraError(t('Could not start the camera preview.')))
  }, [cameraActive, t])

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  function setPhoto(file) {
    setPhotoFile(file)
    setPhotoPreview(file ? URL.createObjectURL(file) : student?.photo_url || '')
  }

  function selectPhoto(event) {
    setPhoto(event.target.files?.[0] || null)
  }

  async function startCamera() {
    if (cameraStarting) return
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('Camera access is not supported by this browser.'))
      return
    }

    const requestId = ++cameraRequestId.current
    setCameraStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      })
      if (requestId !== cameraRequestId.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      cameraStream.current = stream
      setCameraActive(true)
    } catch (cameraRequestError) {
      if (requestId !== cameraRequestId.current) return
      const message = cameraRequestError.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow camera permission and try again.'
        : cameraRequestError.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : cameraRequestError.message || 'Could not access the camera.'
      setCameraError(t(message))
    } finally {
      if (requestId === cameraRequestId.current) setCameraStarting(false)
    }
  }

  function stopCamera() {
    cameraRequestId.current += 1
    cameraStream.current?.getTracks().forEach((track) => track.stop())
    cameraStream.current = null
    setCameraStarting(false)
    setCameraActive(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError(t('The camera is not ready. Please try again.'))
      return
    }

    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError(t('The camera photo could not be captured. Please try again.'))
        return
      }
      setPhoto(new File([blob], 'student-photo.jpg', { type: 'image/jpeg' }))
      setCameraError('')
      stopCamera()
    }, 'image/jpeg', 0.88)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      daily_limit: form.daily_limit === '' ? null : Number(form.daily_limit),
      gender: user?.roles?.includes('matron') ? 'female' : 'male',
    }

    try {
      const response = editing
        ? await api.patch(`/students/${student.id}`, payload)
        : await api.post('/students', payload)
      let savedStudent = response.data.data
      if (photoFile) {
        const photo = new FormData()
        photo.append('photo', photoFile)
        const photoResponse = await api.post(`/students/${savedStudent.id}/photo`, photo)
        savedStudent = photoResponse.data.data
      }
      onSaved(savedStudent)
    } catch (saveError) {
      setError(requestError(saveError, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
        <header className="modal-header">
          <div><p className="eyebrow">{t(editing ? 'STUDENT PROFILE' : 'NEW RECORD')}</p><h2 id="student-modal-title">{t(editing ? 'Edit student' : 'Add student')}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t('Close')}><X size={19} /></button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}
        <form className="student-form" onSubmit={submit}>
          <div className="form-grid two-columns">
            <label>{t('Student number')}<input name="student_number" value={form.student_number} onChange={updateField} required maxLength={255} /></label>
            <label>{t('Full name')}<input name="full_name" value={form.full_name} onChange={updateField} required maxLength={255} /></label>
            <label>{t('Class')}<input name="class" value={form.class} onChange={updateField} maxLength={100} placeholder={t('e.g. Grade 6A')} /></label>
            <label>{t('Daily spending limit')}<input name="daily_limit" type="number" min="0" step="0.01" value={form.daily_limit} onChange={updateField} placeholder={t('No limit')} /></label>
            <label>{t('Guardian name')}<input name="guardian_name" value={form.guardian_name} onChange={updateField} maxLength={255} /></label>
            <label>{t('Guardian phone')}<input name="guardian_phone" type="tel" value={form.guardian_phone} onChange={updateField} maxLength={50} /></label>
            <div className="field-span photo-upload-field">
              <span className="photo-upload-label">{t('Student photo')}</span>
              {photoPreview && <img className="student-photo-preview" src={photoPreview} alt={t('Student preview')} />}
              <div className="student-photo-actions">
                <label className="student-photo-file">{t('Choose photo')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>
                {!cameraActive
                  ? <button className="student-camera-button" type="button" onClick={startCamera} disabled={cameraStarting}><Camera size={15} />{t(cameraStarting ? 'Opening camera...' : 'Take photo')}</button>
                  : <button className="student-camera-button" type="button" onClick={stopCamera}>{t('Close camera')}</button>}
              </div>
              {cameraActive && <div className="student-camera-preview">
                <video ref={videoRef} autoPlay playsInline muted aria-label={t('Live camera preview')} />
                <button className="primary-button" type="button" onClick={capturePhoto}><Camera size={15} />{t('Capture photo')}</button>
              </div>}
              {cameraError && <p className="student-camera-error" role="alert">{cameraError}</p>}
            </div>
            <label className="field-span">{t('Notes')}<textarea name="notes" rows="3" value={form.notes} onChange={updateField} /></label>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>{t('Cancel')}</button>
            <button className="primary-button" type="submit" disabled={saving}>{t(saving ? 'Saving...' : editing ? 'Save changes' : 'Create student')}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
