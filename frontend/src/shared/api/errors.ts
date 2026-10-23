export function formatApiError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('data' in error) {
      const data = error.data
      if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') return data.detail
    }
    if ('error' in error && typeof error.error === 'string') return error.error
  }
  return 'The request could not be completed. Please try again.'
}
