import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import App from './app/App'
import { store } from './app/store'
import { startProductAnalytics } from './shared/analytics/posthogSdk'
import { AnalyticsConsentPrompt } from './shared/components/AnalyticsConsentPrompt'
import './shared/styles/index.css'

startProductAnalytics()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={{ token: { colorPrimary: '#3659d9', borderRadius: 10, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' } }}>
          <BrowserRouter><App /></BrowserRouter>
          <AnalyticsConsentPrompt />
        </ConfigProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)
