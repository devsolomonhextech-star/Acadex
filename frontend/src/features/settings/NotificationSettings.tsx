import { useEffect, useState } from 'react'
import { Alert, Button, Skeleton, Switch, message } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { fetchAlertSettings, updateAlertSettings, type AlertKey } from './settingsApi'

export default function NotificationSettings() {
  const { accessToken } = useAuth()
  const client = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [draft, setDraft] = useState<Record<AlertKey, boolean> | null>(null)
  const settings = useQuery({
    queryKey: ['alert-settings'],
    queryFn: () => fetchAlertSettings(accessToken!),
    enabled: Boolean(accessToken),
  })
  useEffect(() => {
    if (settings.data) setDraft(settings.data.alerts)
  }, [settings.data])
  const save = useMutation({
    mutationFn: () => updateAlertSettings(accessToken!, draft!),
    onSuccess: async data => {
      client.setQueryData(['alert-settings'], data)
      setDraft(data.alerts)
      toast.success('Alert settings saved')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const dirty = Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data.alerts))
  const canEdit = Boolean(settings.data?.can_edit)

  return <section className="settings-panel settings-profile-panel">
    {contextHolder}
    <div className="settings-section-title">
      <span className="settings-icon blue"><BellOutlined/></span>
      <div>
        <h2>Automatic parent alerts</h2>
        <p>Choose which updates Acadex sends to families as they happen.</p>
      </div>
    </div>
    {settings.isLoading && <Skeleton active paragraph={{ rows: 4 }}/>}
    {settings.isError && <Alert type="error" showIcon message={formatApiError(settings.error)}/>}
    {draft && settings.data && <>
      <div className="settings-alert-list">
        {settings.data.categories.map(category => <div key={category.key} className="settings-alert-row">
          <div>
            <strong>{category.label}</strong>
            <span>{category.description}</span>
          </div>
          <Switch
            checked={draft[category.key]}
            disabled={!canEdit || save.isPending}
            aria-label={category.label}
            onChange={checked => setDraft(current => current ? { ...current, [category.key]: checked } : current)}
          />
        </div>)}
      </div>
      {canEdit
        ? <div className="settings-alert-actions">
          <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save alert settings</Button>
          {dirty && <Button onClick={() => setDraft(settings.data.alerts)}>Discard changes</Button>}
        </div>
        : <Alert type="info" showIcon message="Only a school administrator can change these alerts."/>}
      <Alert
        type="info"
        showIcon
        message="Applies to every family at your school"
        description="Switching an alert off stops both the in-app notification and the push. Parents can still fine-tune their own push notifications in the Acadex Connect app."
      />
    </>}
  </section>
}
