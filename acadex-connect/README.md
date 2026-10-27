# Acadex Connect

Acadex Connect is the native parent and guardian companion for the Acadex school management platform. It uses the existing FastAPI backend and only displays records that the signed-in parent is authorized to see.

## Implemented

- Expo SDK 58, React Native, TypeScript strict mode, and Expo Router.
- Parent login with the existing school slug, email, password, and optional authenticator code contract.
- Access-token and CSRF-token storage in Expo SecureStore; native cookie-based refresh is attempted when the platform retains the backend refresh cookie. Expired sessions return to login.
- Five primary tabs: Home, My Children, Academics, Updates, and Profile.
- Linked child switching with child-specific TanStack Query keys and removal of the previous child’s cached records on switch.
- Parent-authorized attendance history, fee balances and recorded payment history, weekly timetable, published report cards, school announcements, school events, and in-app notifications.
- Report-card PDF generation and native share sheet using Expo Print and Expo Sharing.
- Expo push-permission/token registration and removal on logout. The API stores device tokens against the authenticated parent and school.
- Network status banner, query retry/cache behavior, pull to refresh, empty/loading/error states, accessible controls, and Acadex blue design tokens.

## Run locally

1. Install Node.js compatible with Expo SDK 58 and Android Studio and/or Xcode for a native device build.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` for your environment. This value is public app configuration, never a secret. A physical phone must use the development computer’s LAN IP, not `localhost`.
3. Start the existing API and its configured database/Redis using the repository’s normal workflow. Apply database migrations, including `0021_mobile_push_devices`, before testing push registration.
4. Install and start the app:

   ```sh
   cd acadex-connect
   npm install
   npm start
   ```

   For device simulators, use `npm run android` or `npm run ios`. Expo Go supports screen development; secure storage, push notifications and PDF sharing should be checked in a development build on physical devices.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npx expo-doctor
```

## Android and iOS builds

For local native builds after installing Android Studio/Xcode toolchains:

```sh
npx expo prebuild
npx expo run:android
npx expo run:ios
```

For store builds, configure an EAS project and credentials, then run `npx eas-cli build --platform android` or `npx eas-cli build --platform ios`. Add the assigned EAS project ID under `expo.extra.eas.projectId` in `app.json` before expecting push-token registration to work in a build.

## Backend contracts and remaining work

Parent authentication, linked children, report cards, and notification reads use existing routes. Small parent-scoped contracts were added for attendance, fees/payment history, current timetable, upcoming school/class events, parent-visible announcements, and push-token registration. All student record routes verify the guardian-child relationship on every request.

The following remain backend/product dependencies and are intentionally not represented as successful UI actions:

- Password reset and parent profile/contact editing have no backend routes or email verification workflow.
- The parent payment screen is read-only. No parent online checkout or school payment gateway confirmation flow exists.
- Push tokens are registered, but the backend currently has no push-delivery worker/service. In-app notification history works independently.
- Parent messaging has no conversation or message API.
- Attendance is shown as school-recorded rows and status counts. No documented school-day/holiday policy or date-filter endpoint exists, so the app does not invent an attendance percentage or calendar totals.
- Fee currency is shown only when supplied by the API. The current fee models do not persist a currency field.
- Child profile images and class names are displayed only if the parent-facing API supplies them; the existing children response does not currently provide them.

No example school data or credentials are embedded in this mobile client.
