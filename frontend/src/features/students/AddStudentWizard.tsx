import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, DatePicker, Input, Modal, Select, Steps, Tag } from 'antd'
import { CheckCircleFilled, IdcardOutlined, SolutionOutlined, TeamOutlined } from '@ant-design/icons'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { createStudent, fetchNextAdmissionNumber } from './studentsApi'
import { fetchClassGroups } from '../academic/academicApi'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { Student } from '../../shared/api/types'

// Any of GHA-123456789-0, GHA 123456789 0 or 1234567890 is accepted.
const GHANA_CARD = /^(GHA)?[\s-]*\d{9}[\s-]*\d$/i

const admissionSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter the first name').max(80),
  last_name: z.string().trim().min(1, 'Enter the last name').max(80),
  date_of_birth: z.string().min(1, 'Select the date of birth'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  ghana_card_number: z.string().trim().refine(
    value => !value || GHANA_CARD.test(value), 'Use the format GHA-123456789-0',
  ),
  guardian_first_name: z.string().trim().min(1, 'Enter the guardian’s first name').max(80),
  guardian_last_name: z.string().trim().min(1, 'Enter the guardian’s last name').max(80),
  guardian_relationship: z.string().min(1, 'Choose the relationship'),
  guardian_phone: z.string().trim().min(7, 'Enter a contact phone number').max(40),
  guardian_email: z.string().trim().refine(
    value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email',
  ),
  guardian_ghana_card_number: z.string().trim().refine(
    value => !value || GHANA_CARD.test(value), 'Use the format GHA-123456789-0',
  ),
  guardian_address: z.string().trim().max(255),
  academic_year_id: z.string().optional(),
  class_group_id: z.string().optional(),
})
type AdmissionValues = z.infer<typeof admissionSchema>

const stepFields: (keyof AdmissionValues)[][] = [
  ['first_name', 'last_name', 'date_of_birth', 'gender', 'ghana_card_number'],
  ['guardian_first_name', 'guardian_last_name', 'guardian_relationship', 'guardian_phone',
    'guardian_email', 'guardian_ghana_card_number', 'guardian_address'],
  [],
]

const relationships = ['Mother', 'Father', 'Guardian', 'Aunt', 'Uncle', 'Grandmother', 'Grandfather', 'Sibling', 'Other']
  .map(value => ({ value, label: value }))

const emptyValues: AdmissionValues = {
  first_name: '', last_name: '', date_of_birth: '', ghana_card_number: '',
  guardian_first_name: '', guardian_last_name: '', guardian_relationship: '',
  guardian_phone: '', guardian_email: '', guardian_ghana_card_number: '',
  guardian_address: '', class_group_id: '',
}

export default function AddStudentWizard({
  open, onClose, onAdmitted,
}: { open: boolean; onClose: () => void; onAdmitted?: () => void }) {
  const { accessToken, user } = useAuth()
  const { yearId, years, loading: periodLoading } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [formError, setFormError] = useState('')
  const [admitted, setAdmitted] = useState<Student | null>(null)
  const { control, handleSubmit, reset, setValue, trigger, watch, formState: { errors } } = useForm<AdmissionValues>({
    resolver: zodResolver(admissionSchema),
    mode: 'onTouched',
    defaultValues: emptyValues,
  })
  const academicYearId = watch('academic_year_id')
  const classGroupId = watch('class_group_id')
  const classes = useQuery({
    queryKey: ['class-groups', user?.school_id, academicYearId],
    queryFn: () => fetchClassGroups(accessToken!, academicYearId!),
    enabled: open && Boolean(accessToken) && Boolean(academicYearId),
  })
  const nextNumber = useQuery({
    queryKey: ['next-admission-number', user?.school_id],
    queryFn: () => fetchNextAdmissionNumber(accessToken!),
    enabled: open && Boolean(accessToken),
    staleTime: 0,
  })
  useEffect(() => {
    if (!open) return
    setStep(0)
    setAdmitted(null)
    setFormError('')
    reset({ ...emptyValues, academic_year_id: yearId || undefined })
    void nextNumber.refetch()
    // Only reset when the modal is opened, not on every render.
  }, [open])
  useEffect(() => {
    if (open && yearId) setValue('academic_year_id', yearId)
  }, [open, yearId, setValue])
  const admit = useMutation({
    mutationFn: (values: AdmissionValues) => createStudent(accessToken!, {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      date_of_birth: values.date_of_birth,
      ...(values.gender ? { gender: values.gender } : {}),
      ...(values.ghana_card_number.trim() ? { ghana_card_number: values.ghana_card_number.trim() } : {}),
      guardian: {
        first_name: values.guardian_first_name.trim(),
        last_name: values.guardian_last_name.trim(),
        relationship: values.guardian_relationship,
        phone: values.guardian_phone.trim(),
        ...(values.guardian_email.trim() ? { email: values.guardian_email.trim() } : {}),
        ...(values.guardian_ghana_card_number.trim()
          ? { ghana_card_number: values.guardian_ghana_card_number.trim() } : {}),
        ...(values.guardian_address.trim() ? { address: values.guardian_address.trim() } : {}),
      },
      ...(values.academic_year_id ? { academic_year_id: values.academic_year_id } : {}),
      ...(values.class_group_id ? { class_group_id: values.class_group_id } : {}),
    }),
    onSuccess: async student => {
      setAdmitted(student)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['student-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['admissions-directory'] }),
        queryClient.invalidateQueries({ queryKey: ['admissions-status-counts'] }),
        queryClient.invalidateQueries({ queryKey: ['class-groups'] }),
        queryClient.invalidateQueries({ queryKey: ['next-admission-number'] }),
      ])
      onAdmitted?.()
    },
    onError: error => setFormError(formatApiError(error)),
  })
  const selectedClass = classes.data?.find(item => item.id === classGroupId)
  const selectedYear = years.find(item => item.id === academicYearId)
  const stepItems = useMemo(() => [
    { title: 'Student', icon: <SolutionOutlined/> },
    { title: 'Parent / guardian', icon: <TeamOutlined/> },
    { title: 'Class & review', icon: <IdcardOutlined/> },
  ], [])

  const next = async () => {
    setFormError('')
    if (await trigger(stepFields[step])) setStep(value => Math.min(value + 1, 2))
  }
  const submit = handleSubmit(values => {
    setFormError('')
    admit.mutate(values)
  })
  const close = () => { if (!admit.isPending) onClose() }

  if (admitted) return <Modal open={open} onCancel={close} footer={null} width={520} destroyOnHidden>
    <div className="admit-done">
      <span className="admit-done-icon"><CheckCircleFilled/></span>
      <h3>{admitted.first_name} {admitted.last_name} is admitted</h3>
      <div className="admit-number">
        <small>ADMISSION NUMBER</small>
        <strong>{admitted.admission_number}</strong>
        <span>Generated for this school — quote it on receipts and report cards.</span>
      </div>
      <div className="admit-done-facts">
        <span><small>Class</small><strong>{admitted.class_name ?? 'Not placed yet'}</strong></span>
        <span><small>Status</small><strong><Tag color="green" bordered={false}>{admitted.status}</Tag></strong></span>
      </div>
      <div className="student-form-actions">
        <Button onClick={close}>Close</Button>
        <Link to={`/students/${admitted.id}`}><Button type="primary">Open profile</Button></Link>
      </div>
    </div>
  </Modal>

  return <Modal open={open} onCancel={close} title="Admit a student" footer={null} width={640} destroyOnHidden>
    <p className="modal-intro">
      Capture the student, the parent or guardian the school contacts, and where the student sits.
      The admission number is generated automatically when you save.
    </p>
    <Steps size="small" current={step} items={stepItems} className="admit-steps"/>
    {formError && <div className="student-error modal-error">{formError}</div>}
    <form className="student-form admit-form" onSubmit={submit}>
      {step === 0 && <>
        <div className="admit-number-hint">
          <span><small>ADMISSION NUMBER</small><strong>{nextNumber.data?.admission_number ?? 'Assigning…'}</strong></span>
          <em>Assigned automatically</em>
        </div>
        <div className="student-form-row">
          <div><label>First name</label><Controller control={control} name="first_name"
            render={({ field }) => <Input {...field} placeholder="First name" autoComplete="given-name"/>}/></div>
          <div><label>Last name</label><Controller control={control} name="last_name"
            render={({ field }) => <Input {...field} placeholder="Last name" autoComplete="family-name"/>}/></div>
        </div>
        {errors.first_name && <small>{errors.first_name.message}</small>}
        {errors.last_name && <small>{errors.last_name.message}</small>}
        <div className="student-form-row">
          <div><label>Date of birth</label><Controller control={control} name="date_of_birth"
            render={({ field }) => <DatePicker className="student-date" placeholder="Select date" format="DD MMM YYYY"
              disabledDate={current => Boolean(current && current.isAfter(dayjs(), 'day'))}
              value={field.value ? dayjs(field.value) : null}
              onChange={value => field.onChange(value?.format('YYYY-MM-DD') ?? '')}/>}/></div>
          <div><label>Gender</label><Controller control={control} name="gender"
            render={({ field }) => <Select allowClear placeholder="Select" aria-label="Gender"
              value={field.value} onChange={field.onChange}
              options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }]}/>}/></div>
        </div>
        {errors.date_of_birth && <small>{errors.date_of_birth.message}</small>}
        <label>Ghana Card number <span className="optional-label">Optional</span></label>
        <Controller control={control} name="ghana_card_number"
          render={({ field }) => <Input {...field} placeholder="GHA-123456789-0" autoComplete="off"/>}/>
        {errors.ghana_card_number
          ? <small>{errors.ghana_card_number.message}</small>
          : <span className="admit-help">The student’s national ID, used to match records during transfers.</span>}
      </>}

      {step === 1 && <>
        <p className="admit-step-intro">Who should the school call about this student? The first guardian is the primary contact.</p>
        <div className="student-form-row">
          <div><label>Guardian first name</label><Controller control={control} name="guardian_first_name"
            render={({ field }) => <Input {...field} placeholder="First name"/>}/></div>
          <div><label>Guardian last name</label><Controller control={control} name="guardian_last_name"
            render={({ field }) => <Input {...field} placeholder="Last name"/>}/></div>
        </div>
        {errors.guardian_first_name && <small>{errors.guardian_first_name.message}</small>}
        {errors.guardian_last_name && <small>{errors.guardian_last_name.message}</small>}
        <div className="student-form-row">
          <div><label>Relationship</label><Controller control={control} name="guardian_relationship"
            render={({ field }) => <Select value={field.value || undefined} onChange={field.onChange}
              placeholder="Select" aria-label="Relationship" options={relationships}/>}/></div>
          <div><label>Phone</label><Controller control={control} name="guardian_phone"
            render={({ field }) => <Input {...field} placeholder="+233 24 000 0000" autoComplete="tel"/>}/></div>
        </div>
        {errors.guardian_relationship && <small>{errors.guardian_relationship.message}</small>}
        {errors.guardian_phone && <small>{errors.guardian_phone.message}</small>}
        <label>Email <span className="optional-label">Optional — enables the parent app invite</span></label>
        <Controller control={control} name="guardian_email"
          render={({ field }) => <Input {...field} placeholder="parent@example.com" autoComplete="email"/>}/>
        {errors.guardian_email && <small>{errors.guardian_email.message}</small>}
        <div className="student-form-row">
          <div><label>Ghana Card number <span className="optional-label">Optional</span></label>
            <Controller control={control} name="guardian_ghana_card_number"
              render={({ field }) => <Input {...field} placeholder="GHA-123456789-0"/>}/></div>
          <div><label>Address <span className="optional-label">Optional</span></label>
            <Controller control={control} name="guardian_address"
              render={({ field }) => <Input {...field} placeholder="Area, town"/>}/></div>
        </div>
        {errors.guardian_ghana_card_number && <small>{errors.guardian_ghana_card_number.message}</small>}
      </>}

      {step === 2 && <>
        <div className="admit-review">
          <div><small>STUDENT</small><strong>{watch('first_name')} {watch('last_name')}</strong>
            <span>{watch('date_of_birth') ? dayjs(watch('date_of_birth')).format('D MMM YYYY') : '—'}
              {watch('gender') ? ` · ${watch('gender')}` : ''}{watch('ghana_card_number') ? ` · ${watch('ghana_card_number')}` : ''}</span></div>
          <div><small>PRIMARY GUARDIAN</small><strong>{watch('guardian_first_name')} {watch('guardian_last_name')}</strong>
            <span>{watch('guardian_relationship')} · {watch('guardian_phone')}{watch('guardian_email') ? ` · ${watch('guardian_email')}` : ''}</span></div>
        </div>
        <div className="student-form-row">
          <div><label>Academic year</label><Controller control={control} name="academic_year_id"
            render={({ field }) => <Select value={field.value}
              onChange={value => { field.onChange(value); setValue('class_group_id', '') }}
              placeholder="Select year" loading={periodLoading}
              options={years.map(item => ({ value: item.id, label: item.name }))}/>}/></div>
          <div><label>Class <span className="optional-label">Can be assigned later</span></label>
            <Controller control={control} name="class_group_id"
              render={({ field }) => <Select allowClear value={field.value || undefined} onChange={field.onChange}
                placeholder={academicYearId ? 'Select class' : 'Choose a year first'} disabled={!academicYearId}
                loading={classes.isLoading}
                options={(classes.data ?? []).map(item => ({
                  value: item.id, label: `${item.name}${item.stream ? ` ${item.stream}` : ''}`,
                }))}/>}/></div>
        </div>
        <Alert type="info" showIcon message={selectedClass
          ? `${watch('first_name')} will be enrolled in ${selectedClass.name}${selectedClass.stream ? ` ${selectedClass.stream}` : ''} for ${selectedYear?.name ?? 'this session'}.`
          : 'No class selected yet — the student can be placed from Class assignment once the term starts.'}/>
        <div className="admit-number-hint">
          <span><small>ADMISSION NUMBER</small><strong>{nextNumber.data?.admission_number ?? 'Assigning…'}</strong></span>
          <em>Generated on save</em>
        </div>
      </>}

      <div className="student-form-actions">
        {step === 0
          ? <Button onClick={close}>Cancel</Button>
          : <Button onClick={() => setStep(value => value - 1)} disabled={admit.isPending}>Back</Button>}
        {step < 2
          ? <Button type="primary" onClick={() => void next()}>Continue</Button>
          : <Button type="primary" htmlType="submit" loading={admit.isPending}>Admit student</Button>}
      </div>
    </form>
  </Modal>
}
