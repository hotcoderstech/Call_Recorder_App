# leadflow mobile

Expo/React Native companion app for telecallers: reads the device's call
log (via the custom `expo-call-log-reader` native module), captures call
recordings, and syncs both up to the web backend (`web/backend`, same API
the web frontend uses) so calls show up against the right lead/contact.

Screens: Login, Home, Calls, Contact Details, Analytics, Settings.

Not deployed to the box — this ships as an Android build via EAS, not
through the `local`/`live` web deploy pipeline.
