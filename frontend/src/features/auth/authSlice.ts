import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { SchoolUser } from '../../shared/api/types'

type AuthState = {
  user: SchoolUser | null
  accessToken: string | null
  initialized: boolean
}

const initialState: AuthState = { user: null, accessToken: null, initialized: false }

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionEstablished(state, action: PayloadAction<{ user: SchoolUser; accessToken: string }>) {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
      state.initialized = true
    },
    sessionCleared(state) {
      state.user = null
      state.accessToken = null
      state.initialized = true
    },
    authInitialized(state) {
      state.initialized = true
    },
  },
})

export const { sessionEstablished, sessionCleared, authInitialized } = authSlice.actions
export default authSlice.reducer
