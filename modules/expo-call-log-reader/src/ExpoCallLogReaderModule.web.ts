import { registerWebModule, NativeModule } from 'expo';

// ExpoCallLogReaderModule is not available on the web platform.
class ExpoCallLogReaderModule extends NativeModule<{}> {}

export default registerWebModule(ExpoCallLogReaderModule, 'ExpoCallLogReaderModule');
