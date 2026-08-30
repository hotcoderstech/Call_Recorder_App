import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoCallLogReaderModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoCallLogReaderModule>('ExpoCallLogReader');
