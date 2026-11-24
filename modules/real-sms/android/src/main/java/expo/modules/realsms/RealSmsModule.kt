package expo.modules.realsms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RealSmsModule : Module() {
    companion object {
        var instance: RealSmsModule? = null
    }

    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React Application Context is null")

    private fun getContactName(phoneNumber: String): String {
        if (phoneNumber.isBlank()) return "Unknown"
        return try {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
                    if (idx >= 0) {
                        val name = cursor.getString(idx)
                        if (!name.isNullOrBlank()) return name
                    }
                }
            }
            phoneNumber
        } catch (_: Exception) {
            phoneNumber
        }
    }

    fun emitIncomingSMS(sender: String, body: String, timestamp: Long) {
        val contactName = getContactName(sender)
        this@RealSmsModule.sendEvent("onIncomingSMS", mapOf(
            "sender" to contactName,
            "phoneNumber" to sender,
            "body" to body,
            "timestamp" to timestamp
        ))
    }

    override fun definition() = ModuleDefinition {
        Name("RealSms")

        Events("onIncomingSMS")

        OnCreate {
            instance = this@RealSmsModule
            try {
                SmsForegroundService.start(context)
            } catch (e: Exception) {
                Log.e("RealSms", "Failed to start service on create: ${e.message}")
            }
        }

        OnDestroy {
            if (instance == this@RealSmsModule) {
                instance = null
            }
        }

        Function("startSyncService") {
            SmsForegroundService.start(context)
            return@Function true
        }

        Function("isSupported") {
            return@Function true
        }

        Function("setSyncConfig") { baseUrl: String, receiptNumber: String, apiKey: String? ->
            val prefs = context.getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("baseUrl", baseUrl)
                .putString("receiptNumber", receiptNumber)
                .putString("apiKey", apiKey ?: "")
                .apply()
            return@Function true
        }

        Function("getSyncConfig") {
            val prefs = context.getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)
            return@Function mapOf(
                "baseUrl" to (prefs.getString("baseUrl", "https://buy-sell-server-production.up.railway.app/api") ?: "https://buy-sell-server-production.up.railway.app/api"),
                "receiptNumber" to (prefs.getString("receiptNumber", "") ?: ""),
                "apiKey" to (prefs.getString("apiKey", "") ?: "")
            )
        }

        Function("hasPermissions") {
            val readPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
            val receivePermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
            val sendPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED

            return@Function mapOf(
                "read" to readPermission,
                "receive" to receivePermission,
                "send" to sendPermission,
                "allGranted" to (readPermission && receivePermission && sendPermission)
            )
        }

        AsyncFunction("getInboxMessages") { limit: Int? ->
            val maxCount = limit ?: 250
            val messagesList = mutableListOf<Map<String, Any>>()

            val readPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS)
            if (readPermission != PackageManager.PERMISSION_GRANTED) {
                throw SecurityException("READ_SMS permission not granted")
            }

            val uri = Uri.parse("content://sms")
            val projection = arrayOf("_id", "thread_id", "address", "body", "date", "type", "read")
            val sortOrder = "date DESC LIMIT $maxCount"

            val cursor = context.contentResolver.query(uri, projection, null, null, sortOrder)
            cursor?.use {
                val idIdx = it.getColumnIndex("_id")
                val threadIdIdx = it.getColumnIndex("thread_id")
                val addressIdx = it.getColumnIndex("address")
                val bodyIdx = it.getColumnIndex("body")
                val dateIdx = it.getColumnIndex("date")
                val typeIdx = it.getColumnIndex("type")
                val readIdx = it.getColumnIndex("read")

                while (it.moveToNext()) {
                    val id = if (idIdx >= 0) it.getString(idIdx) else ""
                    val threadId = if (threadIdIdx >= 0) it.getString(threadIdIdx) else ""
                    val address = if (addressIdx >= 0) it.getString(addressIdx) ?: "Unknown" else "Unknown"
                    val body = if (bodyIdx >= 0) it.getString(bodyIdx) ?: "" else ""
                    val date = if (dateIdx >= 0) it.getLong(dateIdx) else System.currentTimeMillis()
                    val type = if (typeIdx >= 0) it.getInt(typeIdx) else 1 // 1 = received, 2 = sent
                    val read = if (readIdx >= 0) it.getInt(readIdx) == 1 else true

                    val contactName = getContactName(address)

                    messagesList.add(mapOf(
                        "id" to id,
                        "threadId" to threadId,
                        "address" to address,
                        "contactName" to contactName,
                        "body" to body,
                        "date" to date,
                        "isIncoming" to (type == 1),
                        "isRead" to read
                    ))
                }
            }

            return@AsyncFunction messagesList
        }

        AsyncFunction("sendDirectSms") { phoneNumber: String, message: String ->
            val sendPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            if (sendPermission != PackageManager.PERMISSION_GRANTED) {
                throw SecurityException("SEND_SMS permission not granted")
            }

            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            val parts = smsManager.divideMessage(message)
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, null, null)
            }

            return@AsyncFunction mapOf(
                "success" to true,
                "phoneNumber" to phoneNumber
            )
        }
    }
}
