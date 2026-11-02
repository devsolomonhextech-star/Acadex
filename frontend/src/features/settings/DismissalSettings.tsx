import { useEffect, useState } from 'react'
import { Alert, Button, InputNumber, Select, Skeleton, Switch, TimePicker, message } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import {
  fetchDismissalSettings, updateDismissalSettings,
  type DismissalDay, type DismissalSettings as Settings,
} from './settingsApi'

const DAY_LABELS: Record<DismissalDay, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

export default function DismissalSettings() {
  const { accessToken } = useAuth()
  const client = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [draft, setDraft] = useState<Settings | null>(null)
  const settings = useQuery({
    queryKey: ['dismissal-settings'],
    queryFn: () => fetchDismissalSettings(accessToken!),
    enabled: Boolean(accessToken),
  })
  useEffect(() => {
    if (settings.data) setDraft(settings.data.settings)
  }, [settings.data])
  const save = useMutation({
    mutationFn: () => updateDismissalSettings(accessToken!, draft!),
    onSuccess: async data => {
      client.setQueryData(['dismissal-settings'], data)
      setDraft(data.settings)
      toast.success('Dismissal settings saved')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const canEdit = Boolean(settings.data?.can_edit)
  const dirty = Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data.settings))
  const leadChoices = settings.data?.reminder_lead_choices ?? [15, 30, 45, 60]
  const openDays = draft ? Object.values(draft.closing_times).filter(Boolean).length : 0

  const update = (changes: Partial<Settings>) => setDraft(current => current ? { ...current, ...changes } : current)
  const updateDay = (day: DismissalDay, value: string | null) => setDraft(current => current
    ? { ...current, closing_times: { ...current.closing_times, [day]: value } }
    : current)

  return <section className="settings-panel settings-profile-panel">
    {contextHolder}
    <div className="settings-section-title">
      <span className="settings-icon blue"><ClockCircleOutlined/></span>
      <div>
        <h2>Smart Dismissal</h2>
        <p>Set closing times, remind parents before pickup, and decide how a child may be handed over.</p>
      </div>
    </div>
    {settings.isLoading && <Skeleton active paragraph={{ rows: 6 }}/>}
    {settings.isError && <Alert type="error" showIcon message={formatApiError(settings.error)}/>}
    {draft && settings.data && <>
      <div className="settings-dismissal-master">
        <div>
          <strong>Smart Dismissal</strong>
          <span>{draft.enabled
            ? `Active ${openDays} days a week. Pickup reminders and handover rules apply.`
            : 'Off. No pickup reminders are sent and dismissal is tracked manually.'}</span>
        </div>
        <Switch
          checked={draft.enabled}
          disabled={!canEdit || save.isPending}
          aria-label="Enable Smart Dismissal"
          onChange={checked => update({ enabled: checked })}
        />
      </div>

      <h3 className="settings-dismissal-heading">Closing times</h3>
      <p className="settings-dismissal-copy">Switch a day off when school does not close that day, for example weekends or holidays.</p>
      <div className="settings-dismissal-days">
        {settings.data.days.map(day => {
          const closing = draft.closing_times[day]
          return <div className={`settings-dismissal-day${closing ? '' : ' closed'}`} key={day}>
            <span>{DAY_LABELS[day]}</span>
            <TimePicker
              aria-label={`${DAY_LABELS[day]} closing time`}
              format="HH:mm" minuteStep={5} allowClear={false}
              disabled={!canEdit || !closing || save.isPending}
              value={closing ? dayjs(closing, 'HH:mm') : null}
              onChange={value => updateDay(day, value ? value.format('HH:mm') : null)}
            />
            <Switch
              checked={Boolean(closing)}
              disabled={!canEdit || save.isPending}
              aria-label={`${DAY_LABELS[day]} has a closing time`}
              checkedChildren="Open"
              unCheckedChildren="Closed"
              onChange={checked => updateDay(day, checked ? '15:30' : null)}
            />
          </div>
        })}
      </div>

      <h3 className="settings-dismissal-heading">Pickup reminders</h3>
      <div className="settings-alert-row">
        <div>
          <strong>Remind parents before closing</strong>
          <span>Send each family a notification shortly before the child’s closing time, so pickup is not late.</span>
        </div>
        <Switch
          checked={draft.reminder_enabled}
          disabled={!canEdit || save.isPending}
          aria-label="Send pickup reminders"
          onChange={checked => update({ reminder_enabled: checked })}
        />
      </div>
      <div className="settings-dismissal-inline">
        <span>Send reminders</span>
        <Select
          aria-label="Minutes before closing to remind parents"
          value={draft.reminder_lead_minutes}
          disabled={!canEdit || !draft.reminder_enabled || save.isPending}
          onChange={value => update({ reminder_lead_minutes: value })}
          options={leadChoices.map(minutes => ({ value: minutes, label: `${minutes} minutes before closing` }))}
        />
      </div>

      <h3 className="settings-dismissal-heading">Collection & handover</h3>
      <div className="settings-alert-row">
        <div>
          <strong>Authorized guardians only</strong>
          <span>Release a child only to a guardian linked on their record. Anyone else must be cleared by the office first.</span>
        </div>
        <Switch
          checked={draft.authorized_guardians_only}
          disabled={!canEdit || save.isPending}
          aria-label="Release children to authorized guardians only"
          onChange={checked => update({ authorized_guardians_only: checked })}
        />
      </div>
      <div className="settings-dismissal-inline">
        <span>Mark a pickup as late after</span>
        <InputNumber
          aria-label="Minutes after closing before a pickup is late"
          min={0} max={120} step={5} disabled={!canEdit || save.isPending}
          value={draft.late_pickup_after_minutes}
          onChange={value => update({ late_pickup_after_minutes: value ?? 0 })}
        />
        <span>minutes past closing time</span>
      </div>

      {canEdit
        ? <div className="settings-alert-actions">
          <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save dismissal settings</Button>
          {dirty && <Button onClick={() => setDraft(settings.data.settings)}>Discard changes</Button>}
        </div>
        : <Alert type="info" showIcon message="Only a school administrator can change dismissal settings."/>}
      <Alert
        type="info"
        showIcon
        message="How these settings are used"
        description="Closing times drive pickup reminders, and the handover rule tells the gate who may collect a child. Guardians can follow dismissal updates in the Acadex Connect app."
      />
    </>}
  </section>
}
