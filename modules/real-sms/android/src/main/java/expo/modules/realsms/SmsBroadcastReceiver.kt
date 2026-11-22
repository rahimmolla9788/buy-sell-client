package expo.modules.realsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SmsBroadcastReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "RealSmsReceiver"
        private const val DEFAULT_BASE_URL = "http://127.0.0.1:5000/api"
        private const val DEFAULT_RECEIPT_NUMBER = "0197272313"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = try {
                Telephony.Sms.Intents.getMessagesFromIntent(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing messages from intent: ${e.message}")
                null
            }

            if (messages.isNullOrEmpty()) {
                Log.d(TAG, "SMS intent received but no messages parsed")
                return
            }

            val sender = messages.firstOrNull()?.displayOriginatingAddress
                ?: messages.firstOrNull()?.originatingAddress
                ?: "Unknown"

            val bodyBuilder = StringBuilder()
            var timestamp = System.currentTimeMillis()

            for (msg in messages) {
                if (msg != null) {
                    bodyBuilder.append(msg.displayMessageBody ?: msg.messageBody ?: "")
                    timestamp = msg.timestampMillis
                }
            }
            val body = bodyBuilder.toString()

            Log.d(TAG, "Incoming SMS detected from: $sender (length: ${body.length})")

            // 1. Notify JS layer if app is foregrounded / running
            try {
                RealSmsModule.instance?.emitIncomingSMS(sender, body, timestamp)
            } catch (e: Exception) {
                Log.d(TAG, "JS module not active (app closed/minimized): ${e.message}")
            }

            // 2. Guaranteed background delivery directly to backend database
            // Uses WakeLock and goAsync() to prevent OS from sleeping before HTTP POST completes
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
            val wakeLock = powerManager?.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "RealSms:WakeLock")
            try {
                wakeLock?.acquire(20000)
            } catch (_: Exception) {}

            val pendingResult = goAsync()
            Thread {
                try {
                    sendDirectToBackend(context, sender, body, timestamp)
                } catch (e: Exception) {
                    Log.e(TAG, "Background sync error: ${e.message}", e)
                } finally {
                    try {
                        if (wakeLock?.isHeld == true) {
                            wakeLock.release()
                        }
                    } catch (_: Exception) {}
                    try {
                        pendingResult.finish()
                    } catch (_: Exception) {}
                }
            }.start()
        }
    }

    private fun sendDirectToBackend(context: Context, sender: String, body: String, timestamp: Long) {
        val prefs = context.getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)
        val rawBaseUrl = prefs.getString("baseUrl", DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        val baseUrl = if (rawBaseUrl.endsWith("/")) rawBaseUrl.substring(0, rawBaseUrl.length - 1) else rawBaseUrl
        var receiptNumber = prefs.getString("receiptNumber", "")?.trim() ?: ""
        if (receiptNumber.isBlank()) {
            receiptNumber = DEFAULT_RECEIPT_NUMBER
        }
        val apiKey = prefs.getString("apiKey", "") ?: ""

        val endpoint = "$baseUrl/sms/incoming"
        Log.d(TAG, "Posting background SMS to: $endpoint for receipt: $receiptNumber")

        val jsonPayload = JSONObject().apply {
            put("receiptNumber", receiptNumber)
            put("userPhone", receiptNumber)
            put("recipientPhone", receiptNumber)
            put("receivedAt", System.currentTimeMillis())

            val msgObj = JSONObject().apply {
                put("id", "bg-sms-$timestamp-${(1000..9999).random()}")
                put("threadId", sender)
                put("sender", sender)
                put("phoneNumber", sender)
                put("body", body)
                put("timestamp", timestamp)
                put("isIncoming", true)
                put("isRead", false)
                put("receiptNumber", receiptNumber)
                put("recipientPhone", receiptNumber)
            }
            put("message", msgObj)

            val deviceObj = JSONObject().apply {
                put("modelName", Build.MODEL ?: "Android Device")
                put("brand", Build.BRAND ?: "Android")
                put("osVersion", Build.VERSION.RELEASE ?: "")
                put("platform", "android")
                put("receiptNumber", receiptNumber)
            }
            put("device", deviceObj)
        }

        var connection: HttpURLConnection? = null
        try {
            val url = URL(endpoint)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
                if (apiKey.isNotBlank()) {
                    setRequestProperty("Authorization", "Bearer $apiKey")
                }
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(jsonPayload.toString())
                writer.flush()
            }

            val statusCode = connection.responseCode
            if (statusCode in 200..299) {
                Log.i(TAG, "Successfully saved incoming SMS to database! HTTP $statusCode")
            } else {
                val errorStream = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                Log.w(TAG, "Server returned status $statusCode: $errorStream")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to deliver background SMS to backend: ${e.message}")
        } finally {
            try {
                connection?.disconnect()
            } catch (_: Exception) {}
        }
    }
}

