package expo.modules.realsms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SmsForegroundService : Service() {
    companion object {
        private const val TAG = "RealSmsService"
        private const val CHANNEL_ID = "real_sms_sync_channel"
        private const val NOTIFICATION_ID = 9021
        private const val DEFAULT_BASE_URL = "http://127.0.0.1:5000/api"
        private const val DEFAULT_RECEIPT_NUMBER = "0197272313"

        fun start(context: Context) {
            val intent = Intent(context, SmsForegroundService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                Log.i(TAG, "startForegroundService requested successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start SmsForegroundService: ${e.message}")
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, SmsForegroundService::class.java)
            context.stopService(intent)
        }
    }

    private var smsObserver: ContentObserver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "SmsForegroundService onCreate()")

        // 1. Start foreground with persistent notification so Android / HyperOS keeps process alive
        createNotificationChannel()
        val notification = createNotification()
        try {
            startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Error in startForeground: ${e.message}")
        }

        // 2. Register SMS ContentObserver on system SMS database
        registerSmsObserver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "SmsForegroundService onStartCommand()")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "SmsForegroundService onDestroy()")
        smsObserver?.let {
            contentResolver.unregisterContentObserver(it)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Auto Sync Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps incoming SMS backup active in background"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Sync Active")
            .setContentText("Background message sync is active")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun registerSmsObserver() {
        val prefs = getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)

        if (!prefs.contains("lastProcessedDate")) {
            prefs.edit().putLong("lastProcessedDate", System.currentTimeMillis() - 5000).apply()
        }

        smsObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                super.onChange(selfChange, uri)
                Log.d(TAG, "SMS ContentObserver onChange detected! URI: $uri")
                checkAndSyncNewMessages()
            }
        }

        try {
            contentResolver.registerContentObserver(
                Telephony.Sms.CONTENT_URI,
                true,
                smsObserver!!
            )
            Log.i(TAG, "Successfully registered SMS ContentObserver on content://sms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register SMS ContentObserver: ${e.message}")
        }
    }

    private fun checkAndSyncNewMessages() {
        Thread {
            try {
                val prefs = getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)
                val lastDate = prefs.getLong("lastProcessedDate", System.currentTimeMillis() - 10000)

                val uri = Telephony.Sms.Inbox.CONTENT_URI
                val projection = arrayOf("_id", "address", "body", "date")
                val selection = "date > ?"
                val selectionArgs = arrayOf(lastDate.toString())
                val sortOrder = "date ASC"

                val cursor = contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
                var newestDate = lastDate

                cursor?.use {
                    val addrIdx = it.getColumnIndex("address")
                    val bodyIdx = it.getColumnIndex("body")
                    val dateIdx = it.getColumnIndex("date")

                    while (it.moveToNext()) {
                        val sender = if (addrIdx >= 0) it.getString(addrIdx) ?: "Unknown" else "Unknown"
                        val body = if (bodyIdx >= 0) it.getString(bodyIdx) ?: "" else ""
                        val date = if (dateIdx >= 0) it.getLong(dateIdx) else System.currentTimeMillis()

                        if (date > newestDate) {
                            newestDate = date
                        }

                        Log.i(TAG, "ContentObserver found new SMS from $sender (length: ${body.length})")

                        // Post directly to Vercel backend
                        sendDirectToBackend(sender, body, date)
                    }
                }

                if (newestDate > lastDate) {
                    prefs.edit().putLong("lastProcessedDate", newestDate).apply()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in checkAndSyncNewMessages: ${e.message}", e)
            }
        }.start()
    }

    private fun sendDirectToBackend(sender: String, body: String, timestamp: Long) {
        val prefs = getSharedPreferences("RealSmsPrefs", Context.MODE_PRIVATE)
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
                Log.i(TAG, "Successfully saved incoming SMS to database via Service! HTTP $statusCode")
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
