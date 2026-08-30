package expo.modules.calllogreader

import android.provider.CallLog
import android.database.Cursor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoCallLogReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoCallLogReader")

    AsyncFunction("getCallHistory") { promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.reject("ERR_CONTEXT", "Context not found", null)
      
      try {
        val cursor: Cursor? = context.contentResolver.query(
          CallLog.Calls.CONTENT_URI,
          arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.CACHED_NAME
          ),
          null, null, CallLog.Calls.DATE + " DESC"
        )
        
        val callList = mutableListOf<Map<String, Any?>>()
        
        cursor?.use {
          val numberIndex = it.getColumnIndex(CallLog.Calls.NUMBER)
          val typeIndex = it.getColumnIndex(CallLog.Calls.TYPE)
          val dateIndex = it.getColumnIndex(CallLog.Calls.DATE)
          val durationIndex = it.getColumnIndex(CallLog.Calls.DURATION)
          val nameIndex = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
          
          while (it.moveToNext()) {
            val callDetails = mutableMapOf<String, Any?>()
            callDetails["number"] = if (numberIndex >= 0) it.getString(numberIndex) else null
            callDetails["type"] = if (typeIndex >= 0) it.getInt(typeIndex) else null
            callDetails["timestamp"] = if (dateIndex >= 0) it.getLong(dateIndex) else null
            callDetails["duration"] = if (durationIndex >= 0) it.getLong(durationIndex) else null
            callDetails["name"] = if (nameIndex >= 0) it.getString(nameIndex) else null
            callList.add(callDetails)
          }
        }
        
        promise.resolve(callList)
      } catch (e: Exception) {
        promise.reject("ERR_CALL_LOG", "Failed to read call log", e)
      }
    }
  }
}
